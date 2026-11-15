import assert from "node:assert/strict";
import { test } from "node:test";
import { clock, exercises, exerciseDuration, validateEntries, WorkoutSession } from "../src/lib/workout.ts";

test("one round has nine exercises with consecutive left/right hip lifts", () => {
	assert.equal(exercises.length, 9);
	assert.deepEqual(exercises.slice(3, 5).map((move) => move.focus), ["Obliques · left", "Obliques · right"]);
	assert.ok(exercises.every((move) => !move.name.includes("Russian")));
});

test("only explicit valid records, sorted, with no duplicates", () => {
	assert.deepEqual(validateEntries([]), []);
	assert.deepEqual(validateEntries([{ date: "2026-11-15", status: "done" }, { date: "2024-02-29", status: "skipped" }]).map((entry) => entry.date), ["2024-02-29", "2026-11-15"]);
	for (const invalid of [null, {}, [{ date: "2026-02-29", status: "done" }], [{ date: "2026-04-31", status: "done" }], [{ date: "2026-11-15", status: "maybe" }], [{ date: "2026-1-1", status: "done" }], [{ date: "2026-11-15", status: "done" }, { date: "2026-11-15", status: "skipped" }]]) {
		assert.throws(() => validateEntries(invalid));
	}
});

test("clock rounds before formatting minutes; durations clamp and snap", () => {
	assert.equal(clock(59.1), "01:00");
	assert.equal(clock(0), "00:00");
	assert.equal(clock(-1), "00:00");
	assert.equal(exerciseDuration(0), 20);
	assert.equal(exerciseDuration(500), 90);
	assert.equal(exerciseDuration(NaN), 40);
	assert.equal(exerciseDuration(43), 45);
});

test("deadlines advance on time and catch up after late ticks", () => {
	const session = new WorkoutSession();
	session.start(1000);
	session.tick(41000);
	assert.equal(session.index, 1);
	assert.equal(session.left, 40);
	session.tick(126000);
	assert.equal(session.index, 3);
	assert.equal(session.left, 35);
	assert.deepEqual(session.boundaries, [35, 75, 115, 155, 195, 235]);
});

test("pause/resume retains fractions, prevents drift, and schedules only remaining boundaries", () => {
	const session = new WorkoutSession();
	session.start(0);
	session.pause(12500);
	assert.equal(session.left, 27.5);
	session.tick(50000);
	assert.equal(session.left, 27.5);
	session.start(100000);
	assert.equal(session.boundaries[0], 27.5);
	session.tick(127500);
	assert.equal(session.index, 1);
	assert.equal(session.left, 40);
});

test("completes exactly once at six minutes; replay resets to the first move", () => {
	const session = new WorkoutSession();
	session.start(0);
	assert.equal(session.boundaries.length, 9);
	assert.equal(session.boundaries.at(-1), 360);
	session.tick(360000);
	assert.equal(session.finished, true);
	assert.equal(session.running, false);
	assert.equal(session.index, 8);
	assert.equal(session.progress, 100);
	session.start(400000);
	assert.equal(session.index, 0);
	assert.equal(session.left, 40);
	assert.equal(session.finished, false);
});

test("navigation/reset cancel running state; skip past final finishes", () => {
	const session = new WorkoutSession(20);
	session.start(0);
	session.move(-1, 1000);
	assert.equal(session.index, 0);
	assert.equal(session.left, 20);
	assert.equal(session.running, false);
	for (let i = 0; i < 9; i++) session.move(1, 1000);
	assert.equal(session.finished, true);
	session.move(-1, 1000);
	assert.equal(session.finished, false);
	assert.equal(session.index, 7);
	session.reset();
	assert.equal(session.index, 0);
	assert.equal(session.progress, 0);
});
