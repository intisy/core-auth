// @ts-nocheck
// Pick an account index from a pool given current availability. Strategies:
//   "sticky"       keep using the cursor (per lane) until it goes unavailable
//   "round-robin"  advance to the next available index every call
//   "hybrid"       sticky, but when nobody is free pick whoever frees up soonest
// The cursor is per-lane when a lane is given, otherwise the pool-wide activeIndex.

import { isAvailable as builtinAvailable, availableAt } from "./ratelimit.js";

function laneCursor(pool, lane) {
  if (lane && pool.activeIndexByLane && typeof pool.activeIndexByLane[lane] === "number") return pool.activeIndexByLane[lane];
  return pool.activeIndex || 0;
}

function setLaneCursor(pool, lane, index) {
  if (lane) {
    pool.activeIndexByLane = pool.activeIndexByLane || {};
    pool.activeIndexByLane[lane] = index;
  } else {
    pool.activeIndex = index;
  }
}

function firstAvailableFrom(pool, start, lane, now, available) {
  const n = pool.accounts.length;
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n;
    if (available(pool.accounts[i], lane, now)) return i;
  }
  return -1;
}

// soonest-free account, used as the hybrid fallback so the caller can wait
function soonestFree(pool, lane, now) {
  let best = -1, bestAt = Infinity;
  for (let i = 0; i < pool.accounts.length; i++) {
    const at = availableAt(pool.accounts[i], lane, now);
    if (at < bestAt) { bestAt = at; best = i; }
  }
  return best;
}

// returns the chosen index (mutating the cursor), or -1 if the pool is empty.
// for sticky/round-robin a -1 means "none currently available"; hybrid instead
// returns the soonest-free index even when it is not yet usable. `available`
// (default = the built-in predicate) lets a driver add extra skip conditions.
export function selectIndex(pool, lane, now, strategy, available) {
  const n = pool.accounts.length;
  if (n === 0) return -1;
  const isFree = available || builtinAvailable;
  const cursor = laneCursor(pool, lane);
  const strat = strategy || "hybrid";

  if (strat === "round-robin") {
    const i = firstAvailableFrom(pool, (cursor + 1) % n, lane, now, isFree);
    if (i >= 0) setLaneCursor(pool, lane, i);
    return i;
  }

  if (cursor >= 0 && cursor < n && isFree(pool.accounts[cursor], lane, now)) return cursor;

  const i = firstAvailableFrom(pool, cursor, lane, now, isFree);
  if (i >= 0) { setLaneCursor(pool, lane, i); return i; }

  if (strat === "hybrid") {
    const best = soonestFree(pool, lane, now);
    if (best >= 0) setLaneCursor(pool, lane, best);
    return best;
  }
  return -1;
}
