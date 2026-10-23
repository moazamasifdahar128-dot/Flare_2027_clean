import assert from "node:assert/strict";
import { test } from "node:test";
import { leakHits } from "./gig-text.ts";

function blockContactLeak(value: string) {
  return leakHits(value).length > 0;
}

test("plain chat and emoji pass", () => {
  assert.equal(blockContactLeak("Can you edit this duet by Friday?"), false);
  assert.equal(blockContactLeak("Thanks 😀🔥"), false);
  assert.equal(blockContactLeak(""), false);
});

test("phones, spaced digits, and country codes are blocked", () => {
  assert.equal(blockContactLeak("03436588407"), true);
  assert.equal(blockContactLeak("0343 658 8407"), true);
  assert.equal(blockContactLeak("0343-658-8407"), true);
  assert.equal(blockContactLeak("0343*658*8407"), true);
  assert.equal(blockContactLeak("0 3 4 3"), false);
  assert.equal(blockContactLeak("0-3-4-3"), false);
  assert.equal(blockContactLeak("+92 343 6588407"), true);
  assert.equal(blockContactLeak("00923436588407"), true);
  assert.equal(blockContactLeak("call 1234567"), true);
  assert.equal(blockContactLeak("room 123456"), false);
});

test("links and number words are blocked", () => {
  assert.equal(blockContactLeak("see tiktok.com/me"), true);
  assert.equal(blockContactLeak("https://wa.me/923001234567"), true);
  assert.equal(blockContactLeak("my whatsapp number is ready"), false);
  assert.equal(blockContactLeak("zero three four three"), false);
  assert.equal(blockContactLeak("o n e"), false);
  assert.equal(blockContactLeak("one two"), false);
  assert.equal(blockContactLeak("the first cut"), false);
  assert.equal(blockContactLeak("hello@gmail.com"), true);
});

test("the audit samples stay blocked, and a normal quote is allowed", () => {
  assert.equal(blockContactLeak("my number 03001234567"), true);
  assert.equal(blockContactLeak("9 2 3 0 0 1 2 3 4 5 6 7"), true);
  assert.equal(blockContactLeak("zero three zero zero one two three four five six seven"), true);
  assert.equal(blockContactLeak("wa.me/923001234567"), true);
  assert.equal(blockContactLeak("contact me on instagram.com/myid"), true);
  assert.equal(blockContactLeak("my email test@gmail.com"), true);
  assert.equal(blockContactLeak("write me at @gmail"), true);
  assert.equal(blockContactLeak("see telegram.me/name"), true);
  assert.equal(blockContactLeak("Hello, can you do logo for $50? Delivery in 3 days?"), false);
});
