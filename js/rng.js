// rng.js — seedable PRNG for deterministic level layout.
//
// Math.random() is non-seedable in browsers, so a fixed PRNG is required for
// reproducible mazes (same seed → identical maze + paintings + enemies +
// ore). All gameplay-determining randomness in the maze/gallery/enemy/ore
// systems funnels through this module. Visual fluff (engine exhaust
// particles, ore sparkles, EyesBleed overlay noise) deliberately stays on
// Math.random() — those are per-frame visuals, not layout.
//
// Algorithm: mulberry32. ~64 bytes of state, 1 multiply + a few XORs per
// call, decent distribution — overkill for a maze and underkill for crypto,
// which is exactly the right tier.

let _state = 1;
let _seed = 1;

export function setSeed(n) {
    _seed = (n >>> 0) || 1; // 0 is a degenerate state for mulberry32
    _state = _seed;
}

export function getSeed() {
    return _seed;
}

export function random() {
    _state = (_state + 0x6D2B79F5) >>> 0;
    let t = _state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
