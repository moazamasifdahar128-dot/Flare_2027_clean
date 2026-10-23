import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_MAX_BYTES } from "./sample-limit.ts";
import { fitFrame } from "./fit-frame.ts";

test("1080p frame stays untouched and 4K fits inside 1920x1080", () => {
  assert.equal(fitFrame(1920, 1080).skip, true);
  assert.equal(fitFrame(1080, 1920).skip, true);
  const fit = fitFrame(3840, 2160);
  assert.equal(fit.skip, false);
  assert.equal(fit.width, 1920);
  assert.equal(fit.height, 1080);
  assert.equal(fit.bits, 4_000_000);
  assert.equal(SAMPLE_MAX_BYTES, 60 * 1024 * 1024);
});
