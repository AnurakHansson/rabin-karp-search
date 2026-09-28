import { test } from "node:test";
import assert from "node:assert/strict";
import { search, searchMulti } from "../src/index.js";

test("search finds a single occurrence in the middle", () => {
  assert.deepEqual(search("hello world", "world"), [6]);
});

test("search finds overlapping occurrences", () => {
  // "aaa" contains "aa" at 0 and 1 — overlaps must not be skipped.
  assert.deepEqual(search("aaa", "aa"), [0, 1]);
});

test("search finds every occurrence in a repeated pattern", () => {
  assert.deepEqual(search("abababab", "ab"), [0, 2, 4, 6]);
});

test("search returns empty when pattern is absent", () => {
  assert.deepEqual(search("abcdef", "xyz"), []);
});

test("search returns empty for empty pattern", () => {
  assert.deepEqual(search("abc", ""), []);
});

test("search returns empty when pattern is longer than text", () => {
  assert.deepEqual(search("ab", "abc"), []);
});

test("search matches at index 0", () => {
  assert.deepEqual(search("abc", "ab"), [0]);
});

test("search matches at the last possible position", () => {
  assert.deepEqual(search("xyzabc", "abc"), [3]);
});

test("search throws on non-string arguments", () => {
  assert.throws(() => search(123, "a"), TypeError);
  assert.throws(() => search("a", null), TypeError);
});

test("search handles a pattern that is the whole text", () => {
  assert.deepEqual(search("exact", "exact"), [0]);
});

test("searchMulti finds multiple distinct patterns", () => {
  const hits = searchMulti("the cat and the bat", ["cat", "bat"]);
  assert.deepEqual(
    hits.map((h) => [h.index, h.pattern]),
    [
      [4, "cat"],
      [16, "bat"],
    ],
  );
});

test("searchMulti reports the same pattern at multiple positions", () => {
  const hits = searchMulti("one two one two", ["one"]);
  assert.deepEqual(
    hits.map((h) => [h.index, h.pattern]),
    [
      [0, "one"],
      [8, "one"],
    ],
  );
});

test("searchMulti returns empty for empty patterns array", () => {
  assert.deepEqual(searchMulti("abc", []), []);
});

test("searchMulti skips empty-string patterns", () => {
  assert.deepEqual(searchMulti("abc", ["", "b"]), [
    { index: 1, pattern: "b" },
  ]);
});

test("searchMulti throws on non-array patterns", () => {
  assert.throws(() => searchMulti("abc", "b"), TypeError);
});

test("searchMulti throws when a pattern is not a string", () => {
  assert.throws(() => searchMulti("abc", [42]), TypeError);
});

test("searchMulti handles patterns of different lengths", () => {
  const hits = searchMulti("a ab abc", ["a", "ab", "abc"]);
  // At index 0: "a" matches. At index 2: "ab" matches. At index 5: "abc" matches.
  // "a" also matches at 2 and 5; "ab" also matches at 5.
  assert.deepEqual(
    hits.map((h) => [h.index, h.pattern]),
    [
      [0, "a"],
      [2, "a"],
      [2, "ab"],
      [5, "a"],
      [5, "ab"],
      [5, "abc"],
    ],
  );
});

test("searchMulti orders same-index hits by patterns-array order", () => {
  // Two different patterns of the same length match at the same index.
  // Output order follows the order in the input array, not alphabetical.
  const hits = searchMulti("abc", ["abc", "ab"]);
  assert.deepEqual(
    hits.map((h) => h.pattern),
    ["abc", "ab"],
  );
});

test("search does not false-positive on hash collisions", () => {
  // We can't easily force a collision with this hash, but we can at least
  // confirm that two strings sharing a prefix but differing late don't match.
  assert.deepEqual(search("abcdefghij", "abcdefgxij"), []);
});
