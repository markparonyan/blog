import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkoutAudio } from "../src/lib/workout-audio.ts";

class FakeParam {
	value = 0;
	events = [];
	setValueAtTime(...args) { this.events.push(args); }
	linearRampToValueAtTime(...args) { this.events.push(args); }
	setTargetAtTime(value) { this.value = value; }
}
class FakeNode {
	gain = new FakeParam();
	frequency = new FakeParam();
	stops = [];
	disconnected = false;
	connect() {}
	disconnect() { this.disconnected = true; }
	start(time) { this.startTime = time; }
	stop(time) { this.stops.push(time); }
}
class FakeContext {
	static last;
	currentTime = 10;
	state = "suspended";
	destination = {};
	oscillators = [];
	gains = [];
	constructor() { FakeContext.last = this; }
	createGain() { const node = new FakeNode(); this.gains.push(node); return node; }
	createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
	addEventListener() {}
	async resume() { this.state = "running"; }
	async close() { this.state = "closed"; }
}

test("audio-clock alerts cover every boundary, final included; volume changes live; cancel removes queued tones", async () => {
	globalThis.window = { AudioContext: FakeContext };
	try {
		const audio = new WorkoutAudio();
		await audio.unlock();
		const context = FakeContext.last;
		assert.equal(context.state, "running");
		audio.schedule([40, 80, 120, 160, 200, 240, 280, 320, 360]);
		assert.equal(context.oscillators.length, 27);
		assert.equal(context.oscillators[0].startTime, 50);
		assert.equal(context.oscillators[24].startTime, 370);
		assert.equal(context.oscillators[26].startTime, 370.6);
		assert.equal(context.oscillators[24].frequency.value, 1100);
		audio.setVolume(100);
		assert.equal(context.gains[0].gain.value, 0.6);
		audio.setVolume(0);
		assert.equal(context.gains[0].gain.value, 0);
		audio.test();
		assert.equal(context.oscillators.length, 30);
		assert.equal(context.oscillators[0].stops.length, 1, "test must not cancel scheduled alerts");
		audio.cancel();
		assert.ok(context.oscillators.every((voice) => voice.disconnected && voice.stops.length === 2));
		assert.ok(context.gains.slice(1).every((gain) => gain.disconnected));
		audio.schedule([20]);
		assert.equal(context.oscillators.length, 33);
		audio.dispose();
		assert.equal(context.state, "closed");
	} finally { delete globalThis.window; }
});

test("missing/blocked audio is an explicit failure, not a silently running timer", async () => {
	globalThis.window = {};
	try { await assert.rejects(new WorkoutAudio().unlock(), /not supported/); }
	finally { delete globalThis.window; }
});
