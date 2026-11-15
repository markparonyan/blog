export const exercises = [
	{ name: "W Raises", hint: "10 reps · slow & controlled", focus: "Upper back" },
	{ name: "Knee Slides", hint: "30–40 seconds", focus: "Core control" },
	{ name: "Flutter Kicks", hint: "30–40 seconds", focus: "Lower abs" },
	{ name: "Side Plank Hip Lifts", hint: "10 reps · left side", focus: "Obliques · left" },
	{ name: "Side Plank Hip Lifts", hint: "10 reps · right side", focus: "Obliques · right" },
	{ name: "Crunches", hint: "15 reps · controlled", focus: "Upper abs" },
	{ name: "Bicycle Crunches", hint: "30–40 seconds", focus: "Abs & obliques" },
	{ name: "Dead Bug", hint: "10 reps each side", focus: "Core stability" },
	{ name: "Leg Lift Overs", hint: "30–40 seconds", focus: "Lower abs" },
];

export interface WorkoutEntry { date: string; status: "done" | "skipped" }

/** Fail the build on ambiguous dates, statuses or duplicate entries. Never fabricate history. */
export function validateEntries(value: unknown): WorkoutEntry[] {
	if (!Array.isArray(value)) throw new Error("Workout entries must be an array");
	const dates = new Set<string>();
	return value.map<WorkoutEntry>((entry: unknown) => {
		if (!entry || typeof entry !== "object" || !("date" in entry) || !("status" in entry)) {
			throw new Error("Each workout entry needs date and status");
		}
		const { date, status } = entry;
		if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
			throw new Error(`Invalid workout date: ${String(date)}`);
		}
		if (status !== "done" && status !== "skipped") throw new Error(`Invalid workout status for ${date}`);
		if (dates.has(date)) throw new Error(`Duplicate workout date: ${date}`);
		dates.add(date);
		return { date, status };
	}).sort((a, b) => a.date.localeCompare(b.date));
}

export function clock(seconds: number): string {
	const whole = Math.max(0, Math.ceil(seconds));
	return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export function exerciseDuration(value: number): number {
	return Number.isFinite(value) ? Math.max(20, Math.min(90, Math.round(value / 5) * 5)) : 40;
}

/** Monotonic deadlines, not decrementing intervals: late ticks cannot stretch a round. */
export class WorkoutSession {
	duration: number;
	index = 0;
	left: number;
	running = false;
	finished = false;
	private deadline = 0;

	constructor(duration = 40) {
		this.duration = exerciseDuration(duration);
		this.left = this.duration;
	}

	start(now: number) {
		if (this.finished) this.reset();
		if (this.running) return;
		this.running = true;
		this.deadline = now + this.left * 1000;
	}

	tick(now: number) {
		if (!this.running) return;
		while (now >= this.deadline) {
			if (this.index === exercises.length - 1) {
				this.running = false;
				this.finished = true;
				this.left = 0;
				return;
			}
			this.index++;
			this.deadline += this.duration * 1000;
		}
		this.left = Math.max(0, (this.deadline - now) / 1000);
	}

	pause(now: number) {
		this.tick(now);
		this.running = false;
	}

	move(direction: -1 | 1, now: number) {
		this.pause(now);
		if (direction === 1 && this.index === exercises.length - 1) {
			this.finished = true;
			this.left = 0;
			return;
		}
		this.index = Math.max(0, this.index + direction);
		this.finished = false;
		this.left = this.duration;
	}

	reset() {
		this.running = false;
		this.finished = false;
		this.index = 0;
		this.left = this.duration;
	}

	get progress() {
		return this.finished ? 100 : 100 * (this.index * this.duration + this.duration - this.left) / (exercises.length * this.duration);
	}

	/** Seconds until each remaining move ends, including the final move. */
	get boundaries() {
		return Array.from({ length: exercises.length - this.index }, (_, i) => this.left + i * this.duration);
	}
}
