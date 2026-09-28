/**
 * Rabin–Karp substring search.
 *
 * Uses a rolling polynomial hash so that each text window after the first is
 * hashed in O(1). When a window hash matches the pattern hash we still do a
 * byte-by-byte comparison before reporting a hit — hash collisions are rare
 * but real, and verifying is what makes this a correct search, not a
 * probabilistic one.
 *
 * We work on UTF-16 code units (JavaScript strings) directly. This keeps the
 * implementation dependency-free and the behaviour predictable: indices are
 * exactly the values you'd pass to String.prototype.slice. A surrogate pair
 * therefore counts as two units; that is documented in the README rather than
 * papered over, because handling it transparently would mean re-encoding every
 * input and silently changing the meaning of every returned index.
 */

/**
 * Largest prime that fits safely in a 32-bit signed integer. We reduce modulo
 * this after every arithmetic step so intermediate products never exceed
 * Number.MAX_SAFE_INTEGER (2^53 - 1): with a base of 65536 and a modulus under
 * 2^31, the worst intermediate is base * modulus < 2^47, which is safe.
 */
const PRIME = 2147483647;

/**
 * Base for the polynomial hash. Chosen as 2^16 so that a 16-bit code unit can
 * occupy exactly one "digit" of the polynomial, and so that base and modulus
 * are coprime (PRIME is prime, so it's coprime to everything greater than 1).
 */
const BASE = 65536;

/**
 * Compute (a * b) % PRIME without the intermediate product ever exceeding
 * Number.MAX_SAFE_INTEGER. Both inputs must already be in [0, PRIME).
 */
function modMul(a, b) {
  // a, b < 2^31, so a * b < 2^62 which can lose precision. Split b into two
  // 16-bit halves and accumulate: each partial product is < 2^47, safe.
  const lo = b & 0xffff;
  const hi = b - lo; // multiple of 2^16, still < 2^31
  let result = (a * lo) % PRIME;
  result = (result + ((a * hi) % PRIME)) % PRIME;
  return result;
}

/**
 * Compute BASE raised to the power `exp`, modulo PRIME, by repeated squaring.
 * Used once per search to precompute BASE^(patternLength-1) for the roll.
 */
function modPow(exp) {
  let result = 1;
  let base = BASE % PRIME;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = modMul(result, base);
    e = Math.floor(e / 2);
    if (e > 0) base = modMul(base, base);
  }
  return result;
}

/**
 * Compute the Rabin–Karp polynomial hash of an entire string.
 * hash(s) = (s[0]*BASE^(n-1) + s[1]*BASE^(n-2) + ... + s[n-1]) % PRIME.
 */
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (modMul(h, BASE) + s.charCodeAt(i)) % PRIME;
  }
  return h;
}

/**
 * Find every starting index in `text` where `pattern` occurs.
 *
 * @param {string} text - The string to search within.
 * @param {string} pattern - The substring to search for.
 * @returns {number[]} Ascending list of starting indices. Empty if the pattern
 *   is the empty string or longer than the text.
 */
export function search(text, pattern) {
  if (typeof text !== "string" || typeof pattern !== "string") {
    throw new TypeError("search() expects two strings");
  }

  const n = text.length;
  const m = pattern.length;

  // Empty pattern is, by convention here, a non-match. This matches the
  // behaviour of String.prototype.indexOf for the empty string at index 0,
  // but we return no positions rather than every position, because returning
  // every position (n+1 of them) is almost never what a caller wants and is
  // the kind of surprise that breaks callers silently.
  if (m === 0 || m > n) return [];

  const patternHash = hashString(pattern);
  let windowHash = hashString(text.slice(0, m));
  const basePowM1 = modPow(m - 1);

  const result = [];

  for (let i = 0; i <= n - m; i++) {
    if (windowHash === patternHash && text.substr(i, m) === pattern) {
      result.push(i);
    }
    if (i < n - m) {
      // Roll the hash forward: drop the leftmost code unit, shift the rest up
      // by one power of BASE, and add the new rightmost code unit.
      const leaving = text.charCodeAt(i);
      const entering = text.charCodeAt(i + m);
      // Subtract leaving * BASE^(m-1), add BASE * (old window without leading
      // term), then add entering. Done in one expression to keep it tight.
      let rolled =
        (modMul(windowHash - modMul(leaving, basePowM1) + PRIME, BASE) +
          entering) %
        PRIME;
      windowHash = rolled;
    }
  }

  return result;
}

/**
 * Find every occurrence of any of `patterns` in `text`.
 *
 * The point of Rabin–Karp: we hash each pattern once, then walk the text a
 * single time. At each window we check whether the window hash is in the set
 * of pattern hashes; only on a hit do we compare against the specific pattern
 * (or patterns, if hashes collide) that produced that hash.
 *
 * @param {string} text
 * @param {string[]} patterns
 * @returns {Array<{index: number, pattern: string}>} Hits in ascending index
 *   order. Hits at the same index for different patterns are ordered by their
 *   position in `patterns`.
 */
export function searchMulti(text, patterns) {
  if (typeof text !== "string" || !Array.isArray(patterns)) {
    throw new TypeError("searchMulti() expects a string and an array of strings");
  }
  if (patterns.length === 0) return [];

  // Group patterns by length so we only roll windows of one length at a time.
  // A single rolling pass can only track windows of a fixed width; mixing
  // widths would require separate hashes anyway, so we iterate per length.
  const byLength = new Map();
  for (let p = 0; p < patterns.length; p++) {
    const pat = patterns[p];
    if (typeof pat !== "string") {
      throw new TypeError("searchMulti(): every pattern must be a string");
    }
    if (pat.length === 0) continue; // skip empty patterns, same as search()
    if (!byLength.has(pat.length)) byLength.set(pat.length, []);
    byLength.get(pat.length).push({ pat, idx: p });
  }

  const n = text.length;
  const hits = [];

  for (const [m, group] of byLength) {
    if (m > n) continue;

    // Map from hash -> list of {pat, idx} sharing that hash. Multiple
    // distinct patterns can land on the same hash (collision); we verify all
    // of them.
    const hashToPatterns = new Map();
    for (const { pat, idx } of group) {
      const h = hashString(pat);
      if (!hashToPatterns.has(h)) hashToPatterns.set(h, []);
      hashToPatterns.get(h).push({ pat, idx });
    }

    let windowHash = hashString(text.slice(0, m));
    const basePowM1 = modPow(m - 1);

    for (let i = 0; i <= n - m; i++) {
      const candidates = hashToPatterns.get(windowHash);
      if (candidates !== undefined) {
        for (const { pat, idx } of candidates) {
          if (text.substr(i, m) === pat) {
            hits.push({ index: i, pattern: pat, _order: idx });
          }
        }
      }
      if (i < n - m) {
        const leaving = text.charCodeAt(i);
        const entering = text.charCodeAt(i + m);
        windowHash =
          (modMul(windowHash - modMul(leaving, basePowM1) + PRIME, BASE) +
            entering) %
          PRIME;
      }
    }
  }

  // Sort by index, then by original patterns-array order for stable output.
  hits.sort((a, b) => a.index - b.index || a._order - b._order);
  return hits.map(({ index, pattern }) => ({ index, pattern }));
}
