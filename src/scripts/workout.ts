import { clock, exerciseDuration, exercises, WorkoutSession } from "../lib/workout";
import { WorkoutAudio } from "../lib/workout-audio";

const DURATION_KEY = "core21-duration-v1";
const VOLUME_KEY = "workout-alert-volume-v1";
function readSetting(key: string, fallback: number) {
	try {
		const stored = localStorage.getItem(key);
		const value = stored === null ? fallback : Number(stored);
		return Number.isFinite(value) ? value : fallback;
	} catch { return fallback; }
}
function saveSetting(key: string, value: number) {
	try { localStorage.setItem(key, String(value)); } catch { /* Timer works without storage. */ }
}

class WorkoutTimer extends HTMLElement {
	connectedCallback() {
		const events = new AbortController();
		const signal = events.signal;
		const get = <T extends HTMLElement>(id: string) => this.querySelector<T>(`#${id}`)!;
		const session = new WorkoutSession(readSetting(DURATION_KEY, 40));
		const audio = new WorkoutAudio();
		const duration = get<HTMLInputElement>("duration");
		const volume = get<HTMLInputElement>("volume");
		const toggle = get<HTMLButtonElement>("toggle");
		const previous = get<HTMLButtonElement>("previous");
		const next = get<HTMLButtonElement>("next-exercise");
		const test = get<HTMLButtonElement>("test-sound");
		const audioStatus = get("audio-status");
		const announcement = get("announcement");
		let interval: ReturnType<typeof setInterval> | undefined;
		let wakeLock: WakeLockSentinel | null = null;
		let starting = false;
		let lastIndex = -1;
		let lastFinished = false;
		let disconnected = false;

		async function releaseScreen() {
			const lock = wakeLock;
			wakeLock = null;
			try { await lock?.release(); } catch { /* Already released by the browser. */ }
		}
		async function keepScreenOn() {
			if (!("wakeLock" in navigator)) return;
			try {
				const lock = await navigator.wakeLock.request("screen");
				if (disconnected || !session.running || document.hidden) await lock.release();
				else wakeLock = lock;
			} catch { /* Platform or battery settings can deny wake locks. */ }
		}
		const render = () => {
			const exercise = exercises[session.index];
			get("position").textContent = `${String(session.index + 1).padStart(2, "0")} / 09`;
			get("exercise-name").textContent = session.finished ? "Session complete" : exercise.name;
			get("exercise-hint").textContent = session.finished ? "One round, all done." : exercise.hint;
			get("timer").textContent = clock(session.left);
			get("next-name").textContent = session.finished ? "—" : exercises[session.index + 1]?.name ?? "Finish";
			get("total").textContent = clock(session.duration * exercises.length);
			get("bar").style.width = `${session.progress}%`;
			get("progress").setAttribute("aria-valuenow", String(Math.round(session.progress)));
			toggle.textContent = starting ? "Preparing sound…" : session.finished ? "Go again" : session.running ? "Pause" : session.index === 0 && session.left === session.duration ? "Start session" : "Resume";
			toggle.disabled = starting;
			get<HTMLButtonElement>("reset").disabled = starting;
			test.disabled = starting;
			previous.disabled = starting || session.index === 0 && !session.finished;
			next.disabled = starting || session.finished;
			duration.disabled = starting || session.running || session.index !== 0 || session.finished;
			this.querySelectorAll<HTMLElement>("[data-move-duration]").forEach((element) => element.textContent = `${session.duration} s`);
			this.querySelectorAll<HTMLElement>("[data-exercise]").forEach((element, index) => {
				if (session.running && index === session.index) element.setAttribute("aria-current", "step");
				else element.removeAttribute("aria-current");
			});
			if (session.finished && !lastFinished) announcement.textContent = "Round complete. Your record is unchanged.";
			else if (session.index !== lastIndex && session.running) announcement.textContent = `${exercise.name}. ${exercise.hint}.`;
			lastIndex = session.index;
			lastFinished = session.finished;
		};
		const stopTicking = () => { clearInterval(interval); interval = undefined; };
		const pause = () => {
			session.pause(performance.now());
			audio.cancel();
			stopTicking();
			void releaseScreen();
			render();
		};
		audio.onInterrupted = () => {
			if (!session.running) return;
			pause();
			audioStatus.textContent = "Audio was interrupted. Tap Resume to re-enable alerts.";
		};
		const start = async () => {
			if (starting || session.running) return;
			starting = true;
			render();
			try {
				// Resume inside this tap's user activation, before starting the countdown.
				await audio.unlock();
				if (disconnected || document.hidden) return;
				session.start(performance.now());
				audio.schedule(session.boundaries);
				audioStatus.textContent = Number(volume.value) === 0 ? "Alerts muted. Raise alert volume to hear exercise changes." : "";
				announcement.textContent = `${exercises[session.index].name}. Session running.`;
				interval = setInterval(() => {
					session.tick(performance.now());
					if (session.finished) {
						stopTicking();
						void releaseScreen();
						// Let the final, already-scheduled cue finish playing.
					}
					render();
				}, 100);
				void keepScreenOn();
			} catch {
				audioStatus.textContent = "Sound unavailable. Check browser audio permissions, then try Test sound. Timer has not started.";
			} finally { starting = false; if (!disconnected) render(); }
		};

		toggle.addEventListener("click", () => session.running ? pause() : void start(), { signal });
		get("reset").addEventListener("click", () => {
			pause();
			session.reset();
			announcement.textContent = "Session reset.";
			render();
		}, { signal });
		for (const [button, direction] of [[previous, -1], [next, 1]] as const) {
			button.addEventListener("click", () => {
				const wasRunning = session.running;
				pause();
				session.move(direction, performance.now());
				render();
				if (wasRunning && !session.finished) void start();
			}, { signal });
		}
		duration.addEventListener("change", () => {
			if (duration.disabled) return;
			session.duration = exerciseDuration(Number(duration.value));
			duration.value = String(session.duration);
			session.reset();
			saveSetting(DURATION_KEY, session.duration);
			render();
		}, { signal });
		const updateVolume = () => {
			const value = Math.max(0, Math.min(100, Number(volume.value)));
			audio.setVolume(value);
			get("volume-value").textContent = value === 0 ? "Muted" : `${value}%`;
			volume.setAttribute("aria-valuetext", value === 0 ? "Muted" : `${value} percent`);
			saveSetting(VOLUME_KEY, value);
			audioStatus.textContent = value === 0 ? "Alerts muted. Raise alert volume to hear exercise changes." : "";
		};
		volume.addEventListener("input", updateVolume, { signal });
		test.addEventListener("click", async () => {
			try {
				await audio.unlock();
				if (disconnected) return;
				audio.test();
				audioStatus.textContent = Number(volume.value) === 0 ? "Alerts muted. Raise alert volume first." : "Three pulses played. Check they are audible over your music.";
			} catch { audioStatus.textContent = "Cannot play sound. Check browser audio permissions and device volume."; }
		}, { signal });
		document.addEventListener("visibilitychange", () => {
			if (document.hidden && session.running) {
				pause();
				announcement.textContent = "Paused while this page is hidden. Return and tap Resume; keep screen on for audible alerts.";
			}
		}, { signal });
		window.addEventListener("pagehide", () => { if (session.running) pause(); }, { signal });

		duration.value = String(session.duration);
		volume.value = String(Math.max(0, Math.min(100, readSetting(VOLUME_KEY, 70))));
		volume.disabled = false;
		test.disabled = false;
		get<HTMLButtonElement>("reset").disabled = false;
		updateVolume();
		render();
		this.cleanup = () => {
			disconnected = true;
			session.pause(performance.now());
			events.abort();
			stopTicking();
			void releaseScreen();
			audio.dispose();
		};
	}

	private cleanup = () => {};
	disconnectedCallback() { this.cleanup(); }
}

if (!customElements.get("workout-timer")) customElements.define("workout-timer", WorkoutTimer);
