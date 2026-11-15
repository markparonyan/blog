/** Three distinct, sustained pulses. Schedule on the audio clock, not JS timer ticks. */
export class WorkoutAudio {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private voices = new Map<OscillatorNode, GainNode>();
	private volume = 70;
	onInterrupted: () => void = () => {};

	async unlock() {
		if (!this.context) {
			// Older iOS Safari exposes the prefixed constructor.
			const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Audio) throw new Error("Audio is not supported in this browser.");
			this.context = new Audio();
			this.master = this.context.createGain();
			this.master.gain.value = this.level;
			this.master.connect(this.context.destination);
			this.context.addEventListener("statechange", () => {
				if (this.context?.state !== "running") this.onInterrupted();
			});
		}
		if (this.context.state !== "running") await this.context.resume();
		if (this.context.state !== "running") throw new Error("Audio is paused by your browser.");
	}

	private get level() { return 0.6 * (this.volume / 100) ** 2; }

	setVolume(volume: number) {
		this.volume = Math.max(0, Math.min(100, volume));
		if (this.context && this.master) {
			this.master.gain.setTargetAtTime(this.level, this.context.currentTime, 0.015);
		}
	}

	/** Cancel even queued tones when pausing, resetting or changing exercises. */
	cancel() {
		for (const [voice, envelope] of this.voices) {
			voice.onended = null;
			voice.stop();
			voice.disconnect();
			envelope.disconnect();
		}
		this.voices.clear();
	}

	private cue(when: number, final = false) {
		const context = this.context;
		if (!context || !this.master) return;
		for (let pulse = 0; pulse < 3; pulse++) {
			const oscillator = context.createOscillator();
			const envelope = context.createGain();
			const start = when + pulse * 0.3;
			oscillator.type = "square";
			oscillator.frequency.value = (final ? 1100 : 880) + pulse * 220;
			envelope.gain.setValueAtTime(0, start);
			envelope.gain.linearRampToValueAtTime(1, start + 0.015);
			envelope.gain.setValueAtTime(1, start + 0.18);
			envelope.gain.linearRampToValueAtTime(0, start + 0.24);
			oscillator.connect(envelope);
			envelope.connect(this.master);
			this.voices.set(oscillator, envelope);
			oscillator.onended = () => {
				this.voices.delete(oscillator);
				oscillator.disconnect();
				envelope.disconnect();
			};
			oscillator.start(start);
			oscillator.stop(start + 0.25);
		}
	}

	schedule(boundaries: number[]) {
		this.cancel();
		const now = this.context?.currentTime;
		if (now === undefined) return;
		boundaries.forEach((seconds, index) => this.cue(now + seconds, index === boundaries.length - 1));
	}

	test() {
		// Do not cancel a running round's queued alerts.
		this.cue((this.context?.currentTime ?? 0) + 0.02);
	}

	dispose() {
		this.cancel();
		if (this.context) void this.context.close().catch(() => {});
		this.context = null;
		this.master = null;
	}
}
