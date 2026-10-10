# rabin-karp-search

Finds all occurrences of one or more substrings in a text using a rolling polynomial hash. Exports `search(text, pattern)` and `searchMulti(text, patterns)` from `src/index.js`.

## Usage

```js
import { search, searchMulti } from "./src/index.js";

search("hello world", "world"); // [6]

searchMulti("the cat and the bat", ["cat", "bat"]);
// [{ index: 4, pattern: "cat" }, { index: 16, pattern: "bat" }]
```

## Why this exists

The Rabin–Karp algorithm shines when you need to search for many patterns in one pass over the text. A naive approach runs each pattern independently; Rabin–Karp hashes every pattern once, then walks the text a single time per pattern length, checking window hashes against a set of pattern hashes. The trade-off is verification: hash collisions are possible, so every hash match is confirmed with a byte-by-byte comparison before being reported. This library does that verification, so results are exact, not probabilistic.

## Edge cases

- An empty pattern returns no matches (not every position). This is a deliberate choice; see `src/core.js`.
- Indices are UTF-16 code unit offsets, the same units `String.prototype.slice` uses. A surrogate pair counts as two units. If you need code-point indices, pre-encode your inputs.
- `searchMulti` with patterns of different lengths makes one pass per distinct length. Patterns of the same length share a single pass.
- When two patterns match at the same index, ties are broken by their order in the input `patterns` array.

## Running the tests

```
node --test
```

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

