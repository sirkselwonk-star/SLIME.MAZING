// audio.js — Procedural industrial soundtrack (Web Audio API)
// 256-bar arrangement (~7:53) with swing, slides, accents, delay, acid + scream + bass wah + phaser + siren solos

export class SoundtrackManager {
    constructor() {
        this.ctx = null;
        this.playing = false;
        this.muted = false;
        this.bpm = 130;
        this.stepLength = 60 / this.bpm / 4;
        this.swingRatio = 0.58;
        this._interval = null;
        this._continuousNodes = [];

        this.masterGain = null;
        this.compressor = null;
        this.distortion = null;
        this._noiseBuffer = null;

        // Transport
        this.stepIndex = 0;
        this.barCount = 0;
        this.arrIndex = 0;
        this.barInSection = 0;
        this._prevAcidNote = 0;
        this._prevScreamNote = 0;
        this._prevBassNote = 0;
        this._prevPhaserNote = 0;
        this._prevSirenNote = 0;

        // ===== Pattern bank (velocity 0.0–1.0 per step) =====
        //                        1  .  .  .   2  .  .  .   3  .  .  .   4  .  .  .
        this.patBank = [
            // 0: "Stripped"
            { kick:    [1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0],
              clank:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              hihat:   [0, 0,.5, 0,  0, 0,.5, 0,  0, 0,.5, 0,  0, 0,.5, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [.4,0, 0, 0,  0, 0, 0, 0, .4, 0, 0, 0,  0, 0, 0, 0] },

            // 1: "Building"
            { kick:    [1, 0, 0, 0, .8, 0, 0,.3,  1, 0, 0, 0, .8, 0,.6, 0],
              clank:   [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0],
              hihat:   [.5,0, 1,.3, .5, 0, 1,.3, .5, 0, 1,.3, .5, 0, 1,.3],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0,.5] },

            // 2: "Main Groove A"
            { kick:    [1, 0, 0, 0, .8, 0, 0,.3,  1, 0,.3, 0, .7, 0, 1, 0],
              clank:   [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0,.4],
              hihat:   [.6,0, 1,.3, .6, 0, 1,.3, .6, 0, 1,.3, .6, 0, 0, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 1, 0],
              metal:   [.7,0, 0, 0,  0, 0,.4, 0,  0, 0, 0, 0,  0, 0, 0, 0] },

            // 3: "Main Groove B"
            { kick:    [1, 0, 0,.3,  0, 0, 1, 0, .8, 0, 0, 0, .5, 0, 1,.3],
              clank:   [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0,.4,  1, 0, 0, 0],
              hihat:   [.6,.3,1,.3, .6,.3, 1, 0, .6,.3, 1,.3, .5, 0, 0, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 1],
              metal:   [0, 0, 0,.5,  0, 0, 0, 0, .6, 0, 0, 0,  0, 0,.4, 0] },

            // 4: "Breakdown"
            { kick:    [1, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              clank:   [0, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0],
              hihat:   [0, 0, 0, 0, .4, 0, 0, 0,  0, 0, 0, 0, .4, 0, 0, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [.5,0, 0, 0,  0, 0, 0, 0, .3, 0, 0, 0,  0, 0, 0, 0] },

            // 5: "Rebuild"
            { kick:    [1, 0, 0, 0, .6, 0, 0, 0,  1, 0, 0, 0, .6, 0, 0,.3],
              clank:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0, .8, 0, 0, 0],
              hihat:   [.5,0,.7, 0, .5, 0,.7, 0, .5, 0,.7, 0, .5, 0,.7,.3],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [0, 0, 0, 0,  0, 0,.4, 0,  0, 0, 0, 0,  0, 0,.4, 0] },

            // 6: "Heavy"
            { kick:    [1, 0,.3, 0,  1, 0, 0,.3,  1, 0,.3, 0,  1, 0, 1,.3],
              clank:   [0, 0, 0, 0,  1, 0, 0,.3,  0, 0, 0, 0,  1, 0, 0, 0],
              hihat:   [.7,.3,.8,.3, .7,.3,.8,.3, .7,.3,.8,.3, .7,.3,.8, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0,.8],
              metal:   [1, 0, 0, 0,  0, 0,.5, 0,  0, 0, 0,.4,  0, 0, 0, 0] },

            // 7: "Fill"
            { kick:    [1, 0, 0, 0,  1, 0, 1, 0,  1, 0, 1, 1,  1, 1, 1, 1],
              clank:   [0, 0, 0, 0,  0, 0, 0, 0, .3, 0,.4, 0, .5,.6,.8, 1],
              hihat:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              openHat: [1, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 1],
              metal:   [0, 0, 0, 0,  0, 0, 0, 0, .3,.3,.5,.5, .7,.7, 1, 1] },

            // 8: "Solo bed" — stripped-back groove that gives solos room
            { kick:    [1, 0, 0, 0, .6, 0, 0, 0,  1, 0, 0, 0, .6, 0,.5, 0],
              clank:   [0, 0, 0, 0, .7, 0, 0, 0,  0, 0, 0, 0, .7, 0, 0, 0],
              hihat:   [.4,0,.6, 0, .4, 0,.6, 0, .4, 0,.6, 0, .4, 0,.6, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0] },

            // 9: "Half-Time" — clank only on beat 3, spacious kick, open hat accent
            { kick:    [1, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              clank:   [0, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0],
              hihat:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0,.7],
              metal:   [.3,0, 0, 0,  0, 0, 0, 0, .3, 0, 0, 0,  0, 0, 0, 0] },

            // 10: "Double-Time" — relentless 16th-note hihat barrage
            { kick:    [1, 0, 0, 0, .8, 0, 0, 0,  1, 0, 0, 0, .8, 0, 0, 0],
              clank:   [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0],
              hihat:   [.8,.5,.7,.4,.8,.5,.7,.4,.8,.5,.7,.4,.8,.5,.7,.4],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [.5,0, 0, 0,  0, 0, 0, 0, .5, 0, 0, 0,  0, 0, 0, 0] },

            // 11: "Tribal" — heavy metal hits in primal rhythm, no hihat
            { kick:    [1, 0, 0, 1,  0, 0, 1, 0,  0, 1, 0, 0,  1, 0, 0, 0],
              clank:   [0, 0, 1, 0,  0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 1, 0],
              hihat:   [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              openHat: [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
              metal:   [1, 0,.6, 0, .4, 0,.8, 0, .6, 0,.4, 0, .8,.4,.6,.4] },

            // 12: "Chaos" — dense fills, every voice active, random-feeling accents
            { kick:    [1, 0,.5, 0,  1,.3,.7, 0,  1, 0,.5,.3,  1,.5,.7, 1],
              clank:   [0,.5, 0,.3,  1, 0,.4,.5,  0,.3, 0,.5,  1,.3,.5,.7],
              hihat:   [.6,.4,.7,.3,.6,.4,.7,.3,.6,.4,.7,.3,.6,.4,.7,.5],
              openHat: [0, 0, 0, 0,  0, 0, 0,.6,  0, 0, 0, 0,  0, 0, 0,.8],
              metal:   [.5, 0,.3, 0, .5, 0,.3,.5, .5, 0,.3, 0, .5,.3,.5,.7] },
        ];

        // ===== Bass progressions =====
        this.bassProgs = [
            /* 0  root    */ [[0, 55]],
            /* 1  minor   */ [[0, 55], [8, 41.2], [12, 49]],
            /* 2  dark    */ [[0, 55], [4, 58.3], [8, 41.2], [12, 55]],
            /* 3  low-D   */ [[0, 36.7]],
            /* 4  eighth  */ [[0,55],[2,55],[4,41.2],[6,41.2],[8,49],[10,49],[12,55],[14,55]],
            /* 5  descend */ [[0, 55], [4, 49], [8, 41.2], [12, 36.7]],
            /* 6  pedal-E */ [[0, 41.2]],
            /* 7  climb   */ [[0, 41.2], [4, 49], [8, 55], [12, 55]],
            /* 8  chromatic */ [[0, 55], [4, 58.3], [8, 55], [12, 51.9]],
            /* 9  power    */ [[0, 55], [4, 110], [8, 55], [12, 110]],
            /* 10 staccato */ [[0,55],[1,58.3],[2,55],[3,51.9],[4,55],[5,58.3],[6,55],[7,51.9],[8,55],[9,58.3],[10,55],[11,51.9],[12,55],[13,58.3],[14,55],[15,51.9]],
        ];

        // ===== Solo phrases =====
        // Each bar = 16 steps. Positive freq = normal note, negative = accented (wider filter/louder)
        // Consecutive non-zero notes trigger portamento slides
        // A minor pentatonic: A=110/220/440, C=130.8/261.6, D=146.8/293.7,
        //                     E=164.8/329.6, G=196/392

        this.soloBank = {
            // ——— ACID LEAD (sawtooth + resonant filter) ———

            // acidA: "Opening Statement" — deliberate, bluesy, establishing the key
            acidA: [
                [110,  0,  0,  0, 130.8,0,  0,  0, 146.8,0,130.8,0, 110,  0,  0,  0],
                [130.8,0,146.8,0, 164.8,0,  0,  0, 146.8,0,130.8,0, 110,  0,  0,  0],
                [164.8,0,196,  0,-220,  0,  0,  0, 196,  0,164.8,0, 146.8,0,130.8,0],
                [110,  0,  0,  0, 130.8,0,110,  0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],
            // acidB: "Climbing" — ascending runs, building energy
            acidB: [
                [110,  0,130.8,0, 146.8,0,164.8,0,-196,  0,  0,  0, 164.8,0,196,  0],
                [-220, 0,  0,  0, 196,  0,220,  0, 261.6,0,  0,  0, 220,  0,196,  0],
                [220,  0,261.6,0,-293.7,0,261.6,0, 220,  0,196,  0, 220,  0,261.6,0],
                [-293.7,0, 0,  0, 261.6,0,220,  0, 196,  0,  0,  0,   0,  0,  0,  0],
            ],
            // acidC: "Fast Run" — 16th-note flurries showcasing the filter squelch
            acidC: [
                [110,130.8,146.8,164.8, 196,220,196,164.8, 146.8,130.8,110,130.8, 146.8,164.8,-196,0],
                [220,196,164.8,146.8, 130.8,146.8,164.8,196, -220,0,196,164.8, 146.8,130.8,110,0],
                [164.8,0,-220,0, 196,164.8,196,-220, 261.6,0,-293.7,0, 261.6,220,196,164.8],
                [-220,196,164.8,146.8, 130.8,110,130.8,146.8, -164.8,0,  0,  0,   0,  0,  0,  0],
            ],
            // acidD: "Peak" — high register, wide intervals, maximum acid
            acidD: [
                [-220,0,  0,  0,-329.6,0,  0,  0,-220,  0,261.6,0,-392,  0,  0,  0],
                [329.6,0,-440,0, 329.6,0,261.6,0,-392,  0,329.6,0,-440,  0,392,  0],
                [-329.6,0,261.6,0,-293.7,0,261.6,0,-220,0,196,  0, 164.8,0,146.8,0],
                [-220,0,261.6,0,-329.6,0,  0,  0,-220,  0,  0,  0,   0,  0,  0,  0],
            ],
            // acidE: "Cooldown" — descending, sparse, resolving to root
            acidE: [
                [220,  0,  0,  0, 196,  0,  0,  0,   0,  0,  0,  0, 164.8,0,  0,  0],
                [146.8,0,  0,  0, 130.8,0,  0,  0,   0,  0,  0,  0, 110,  0,  0,  0],
                [130.8,0,  0,  0, 110,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
                [110,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— SCREAM LEAD (distorted square + vibrato) ———

            // screamA: "Staccato Attacks" — punchy rhythmic bursts
            screamA: [
                [-220,0,  0,  0,   0,  0,-220,0,-261.6,0,  0,  0, 220,  0,-196,0],
                [  0, 0,-293.7,0,  0,  0,  0,  0,-261.6,0,  0,  0,   0,  0,-220,0],
                [-329.6,0,0,  0,-293.7,0,-261.6,0,  0,  0,  0,  0,-220,  0,196,  0],
                [-261.6,0,0,  0,-220,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],
            // screamB: "Sustained Wail" — long notes with space, vibrato fills gaps
            screamB: [
                [-329.6,0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
                [  0,  0,  0,  0,   0,  0,  0,  0,-293.7,0,  0,  0,   0,  0,  0,  0],
                [  0,  0,  0,  0,-261.6,0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
                [-329.6,0,  0,  0,   0,  0,  0,  0,-440,  0,  0,  0,   0,  0,  0,  0],
            ],
            // screamC: "Rapid Fire" — machine-gun repeated notes climbing up
            screamC: [
                [220,0,220,0, 261.6,0,261.6,0, 293.7,0,293.7,0,-329.6,0,  0,  0],
                [261.6,0,261.6,0, 293.7,0,293.7,0,-329.6,0,329.6,0,-440,0,  0,  0],
                [329.6,0,293.7,0, 261.6,0,293.7,0, 329.6,0,-440,0, 392,0,329.6,0],
                [-440,0,-392,0,-329.6,0,-261.6,0,-220,  0,  0,  0,   0,  0,  0,  0],
            ],
            // screamD: "Chaos" — wide unpredictable leaps, peak aggression
            screamD: [
                [-440,0,  0,  0, 220,  0,-392,0,   0,  0,-261.6,0,329.6,0,  0,  0],
                [-220,0,-440,0,   0,  0,261.6,0,-392,  0,  0,  0,-329.6,0,220,  0],
                [440,0,-261.6,0,-392,0,329.6,0,-220,  0,-440,0, 293.7,0,-261.6,0],
                [-329.6,-293.7,-261.6,-220, -261.6,-293.7,-329.6,-392, -440,0,0,0, 0,0,0,0],
            ],
            // screamE: "Echo Fade" — sparse dying notes, delay fills the space
            screamE: [
                [261.6,0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
                [  0,  0,  0,  0,   0,  0,  0,  0, 220,  0,  0,  0,   0,  0,  0,  0],
                [  0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0, 196,  0,  0,  0],
                [  0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— BASS WAH (sawtooth + sub + resonant bandpass sweep) ———
            // A minor pentatonic bass: A1=55, C2=65.4, D2=73.4, E2=82.4, G2=98, A2=110

            // bassA: "Funky Statement" — syncopated, groovy, classic wah feel
            bassA: [
                [55,  0,  0,-82.4,  0,  0, 55,  0,   0,  0,-65.4,0, 73.4, 0, 55,  0],
                [65.4,0,  0,  0,-82.4,0, 98,  0,-110, 0,  0,  0,  98,  0, 82.4,0],
                [55,  0, 73.4,0,  0,  0,-82.4,0, 65.4,0,  0,  0,  55,  0,-73.4,0],
                [-82.4,0, 0,82.4,  0,  0,-55, 0,   0,  0, 73.4,0,   0,  0,  0,  0],
            ],
            // bassB: "Deep Pocket" — heavy, lots of space, sub weight
            bassB: [
                [-55, 0,  0,  0,   0,  0,  0,  0,-73.4,0,  0,  0,   0,  0,  0,  0],
                [-82.4,0, 0,  0,   0,  0, 55,  0,   0,  0,  0,  0,-65.4,0,  0,  0],
                [-55, 0,  0,  0, 73.4,0,  0,  0,-82.4,0,  0,  0,   0,  0, 98,  0],
                [-110,0,  0,  0,   0,  0,  0,  0,  55,  0,  0,  0,   0,  0,  0,  0],
            ],
            // bassC: "Climber" — building, more active, ascending runs
            bassC: [
                [55,  0,65.4,0, 73.4,0,82.4,0, -98, 0,82.4,0, 73.4,0,65.4,0],
                [55,  0,73.4,0,-82.4,0, 98,  0,-110, 0, 98,  0, 82.4,0,73.4,0],
                [-110,0, 98, 0, 82.4,0,-110, 0,130.8,0,-146.8,0,130.8,0,110, 0],
                [-82.4,0,98, 0,-110, 0,82.4,0, -55, 0,   0,  0,   0,  0,  0,  0],
            ],

            // ——— BASS WAH ACCOMPANIMENT (sparser, textural) ———

            // bassGrooveA: "Wah Accent" — sparse offbeat hits adding color
            bassGrooveA: [
                [0,  0,  0,  0,-82.4,0,  0,  0,   0,  0,  0,  0,  55,  0,  0,  0],
                [0,  0, 73.4,0,  0,  0,  0,  0,-65.4,0,  0,  0,   0,  0,  0,  0],
                [0,  0,  0,  0,-82.4,0,  0,  0,   0,  0, 55,  0,   0,  0, 73.4,0],
                [0,  0,  0,  0,  0,  0,-65.4,0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],
            // bassGrooveB: "Wah Pulse" — rhythmic offbeat pump
            bassGrooveB: [
                [0,  0, 55,  0,  0,  0,-55, 0,   0,  0, 55,  0,   0,  0,-82.4,0],
                [0,  0, 73.4,0,  0,  0,-65.4,0,  0,  0, 73.4,0,   0,  0,-55, 0],
                [0,  0, 82.4,0,  0,  0,-82.4,0,  0,  0, 65.4,0,   0,  0,-73.4,0],
                [0,  0, 55,  0,  0,  0,-82.4,0,  0,  0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— PHASER LEAD (triangle + 6-stage allpass sweep) ———

            // phaserA: "Emergence" — sparse, ethereal, establishing the instrument
            phaserA: [
                [220,  0,  0,  0,   0,  0,  0,  0, 261.6,0,  0,  0,   0,  0,  0,  0],
                [  0,  0,  0,  0, 293.7,0,  0,  0,   0,  0,  0,  0, 261.6,0,  0,  0],
                [329.6,0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0, 293.7,0,  0,  0],
                [261.6,0,  0,  0,   0,  0,  0,  0, 220,  0,  0,  0,   0,  0,  0,  0],
            ],
            // phaserB: "Cascading" — flowing runs with audible sweep
            phaserB: [
                [220,  0,261.6,0, 293.7,0,329.6,0,-392,  0,329.6,0, 293.7,0,261.6,0],
                [293.7,0,329.6,0,-392,  0,-440, 0, 392,  0,329.6,0, 293.7,0,261.6,0],
                [220,  0,261.6,0,-329.6,0,392,  0,-440,  0,392,  0, 329.6,0,293.7,0],
                [-261.6,0,220, 0, 261.6,0,  0,  0, 220,  0,  0,  0,   0,  0,  0,  0],
            ],
            // phaserC: "Soaring" — high register, sustained, wide intervals
            phaserC: [
                [-392, 0,  0,  0,   0,  0,  0,  0,-440,  0,  0,  0,   0,  0,  0,  0],
                [392,  0,  0,  0, 329.6,0,  0,  0,-392,  0,  0,  0,-440,  0,  0,  0],
                [-329.6,0,293.7,0,-392, 0,  0,  0,-440,  0,392,  0, 329.6,0,  0,  0],
                [-392, 0,-440, 0, 392,  0,329.6,0,-293.7,0,  0,  0,   0,  0,  0,  0],
            ],
            // phaserD: "Arpeggiated Storm" — fast arpeggios, peak phaser intensity
            phaserD: [
                [220,261.6,329.6,392,-440,392,329.6,261.6, 220,261.6,329.6,392,-440,392,329.6,261.6],
                [293.7,329.6,392,-440,392,329.6,293.7,261.6, 293.7,329.6,392,-440,329.6,293.7,261.6,220],
                [-440,392,329.6,293.7,261.6,293.7,329.6,-392, -440,392,329.6,261.6,220,261.6,-329.6,0],
                [-392,329.6,-440,392,329.6,293.7,261.6,220, -261.6,0,  0,  0,   0,  0,  0,  0],
            ],
            // phaserE: "Dissolve" — sparse, fading, ethereal tail
            phaserE: [
                [329.6,0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0, 261.6,0,  0,  0],
                [  0,  0,  0,  0,   0,  0,  0,  0, 220,  0,  0,  0,   0,  0,  0,  0],
                [  0,  0,  0,  0, 261.6,0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
                [220,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— ACID LEAD (extended phrases) ———

            // acidF: "Restless Chromatic" — semitone clusters for tension
            acidF: [
                [110,  0,116.5,0, 110,  0,103.8,0,-116.5,0,123.5,0, 116.5,0,110,  0],
                [123.5,0,-130.8,0,123.5,0,116.5,0, 130.8,0,138.6,0,-146.8,0,138.6,0],
                [130.8,0,146.8,0,-155.6,0,146.8,0, 130.8,0,138.6,0, 130.8,0,123.5,0],
                [-116.5,0,110, 0, 116.5,0,110,  0,-103.8,0,  0,  0,   0,  0,  0,  0],
            ],
            // acidG: "Triplet Feel" — syncopated groupings of 3
            acidG: [
                [110,  0,130.8,146.8,0,164.8,196,  0,-220, 0,  0,196,164.8,0,146.8,0],
                [130.8,0,164.8,196,  0,-220,261.6,0, 220,  0,  0,196,164.8,0,130.8,0],
                [-220, 0,196,164.8,  0,-220,261.6,0,-293.7,0,  0,261.6,220,0,196,  0],
                [164.8,0,146.8,130.8,0,110, 0,   0,-110,  0,  0,  0,   0,  0,  0,  0],
            ],
            // acidH: "Sub-bass Acid" — low register growl
            acidH: [
                [55,   0,  0,  0, 65.4, 0,  0,  0,-73.4, 0,65.4, 0,  55,  0,  0,  0],
                [73.4, 0,82.4, 0,-98,   0,  0,  0, 82.4, 0,73.4, 0, 65.4, 0, 55,  0],
                [-55,  0,65.4, 0, 73.4, 0,-82.4,0, 73.4, 0,65.4, 0, -55,  0,  0,  0],
                [73.4, 0,-55,  0,  0,   0, 65.4,0, -55,  0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— SCREAM LEAD (extended phrases) ———

            // screamF: "Siren Wail" — long pitch-bending howl
            screamF: [
                [-220, 0,  0,  0, 220,261.6,293.7,-329.6, 0,  0,  0,  0, 329.6,293.7,261.6,220],
                [  0,  0,-261.6,0,  0,  0,261.6,293.7,-329.6,0,  0,  0,   0,  0,-392, 0],
                [-329.6,329.6,293.7,261.6,-293.7,0,  0,  0, 329.6,-392,-440,0, 392,329.6,-293.7,0],
                [-261.6,0,  0,  0,-220, 0,  0,  0,   0,  0,  0,  0,   0,  0,  0,  0],
            ],
            // screamG: "Dive Bomb" — dramatic descending runs
            screamG: [
                [-440, 0,  0,  0,-440,392,329.6,293.7, 261.6,220,-196,0,   0,  0,  0,  0],
                [-392,329.6,293.7,261.6,-220,196,164.8,146.8,-130.8,0, 0,  0,   0,  0,-220,0],
                [-440,-392,-329.6,-293.7,-261.6,-220,-196,-164.8,-146.8,-130.8,-110,0, 0,0,0,0],
                [-329.6,0,-220,0,-329.6,-261.6,-220,-196,-164.8,-146.8,0,0,  0,  0,  0,  0],
            ],
            // screamH: "Stutter Glitch" — rapid repeated-note stabs
            screamH: [
                [-220, 0,-220, 0,-220, 0,  0,  0,-261.6,0,-261.6,0,-261.6,0,  0,  0],
                [-293.7,0,-293.7,0, 0, 0,-261.6,0,-261.6,0,  0,  0,-220, 0,-220, 0],
                [-329.6,-329.6,-329.6,0,-293.7,-293.7,-293.7,0,-261.6,0,-329.6,0,-392,0,-440,0],
                [-220, 0,-220, 0,-220,-220,-220,-220,-220, 0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— BASS WAH (extended phrases) ———

            // bassD: "Octave Slap" — bouncy octave jumps
            bassD: [
                [-55,  0,110,  0,-55,  0,110,  0,-65.4,0,130.8,0,-65.4,0,130.8,0],
                [-73.4,0,146.8,0,-73.4,0,146.8,0,-82.4,0,164.8,0, 82.4,0,  0,  0],
                [-55,  0,110,  0,-82.4,0,164.8,0, -98,  0,196,  0,-110, 0, 55,  0],
                [-82.4,0,164.8,0,-55,  0,110,  0, -55,  0,  0,  0,   0,  0,  0,  0],
            ],
            // bassE: "Rubber Band" — extreme portamento slides
            bassE: [
                [55,82.4,110,82.4, 55,73.4,98,73.4,-55,65.4,82.4,65.4, 55,  0,  0,  0],
                [73.4,98,-110,98, 73.4,55,65.4,82.4,-110,82.4,65.4,55, 73.4, 0,  0,  0],
                [-55,73.4,98,110,-82.4,65.4,55,73.4, 98,-110,82.4,55, 73.4,98,110,82.4],
                [55,73.4,-98,73.4, 55,  0,  0,  0, -55,  0,  0,  0,   0,  0,  0,  0],
            ],

            // ——— SIREN (FM synthesis — metallic howl) ———

            // sirenA: "Rising Alarm" — ascending metallic wail
            sirenA: [
                [220,  0,  0,  0,-261.6,0,  0,  0, 293.7,0,  0,  0,-329.6,0,  0,  0],
                [293.7,0,-329.6,0, 392, 0,-440, 0, 392,  0,329.6,0, 293.7,0,  0,  0],
                [-261.6,0,293.7,0,-329.6,0,-392,0,-440,  0,  0,  0, 392,  0,-440, 0],
                [-329.6,0,-293.7,0,261.6,0,220, 0,-261.6,0,  0,  0,   0,  0,  0,  0],
            ],
            // sirenB: "Pulse Alarm" — rhythmic FM pulses
            sirenB: [
                [-261.6,0,-261.6,0,  0,  0,  0,  0,-261.6,0,-261.6,0,  0,  0,  0,  0],
                [-329.6,0,-329.6,0,  0,  0,-329.6,0,-329.6,0,  0,  0,  0,  0,  0,  0],
                [-392, 0,-392, 0,-392, 0,  0,  0,-440, 0,-440, 0,-440, 0,  0,  0],
                [-329.6,0,  0,  0,-261.6,0,  0,  0,-220, 0,  0,  0,   0,  0,  0,  0],
            ],
        };

        // ===== 256-bar arrangement (~7:53) =====
        // solo: key into soloBank, soloType: instrument selector
        // Negative notes in phrases = accented, consecutive notes = portamento slide
        // masterPhaser: true = fade in whole-mix phaser for atmospheric wash
        this.arrangement = [
            // ═══ ACT I: AWAKENING (40 bars) ═══

            // --- Intro & build (8 bars) ---
            { pat: 0, bars: 2, bass: 0 },
            { pat: 1, bars: 2, bass: 1 },
            { pat: 2, bars: 4, bass: 1 },

            // --- Acid solo (32 bars) ---
            { pat: 8, bars: 8, bass: 0, solo: 'acidA', soloType: 'acid' },
            { pat: 3, bars: 4, bass: 1 },
            { pat: 6, bars: 8, bass: 2, solo: 'acidB', soloType: 'acid' },
            { pat: 2, bars: 4, bass: 4, solo: 'bassGrooveA', soloType: 'bass' },
            { pat: 6, bars: 4, bass: 4, solo: 'acidC', soloType: 'acid' },
            { pat: 6, bars: 3, bass: 7, solo: 'acidD', soloType: 'acid' },
            { pat: 7, bars: 1, bass: 5 },

            // ═══ ACT II: DESCENT (48 bars) ═══

            // --- Groove (8 bars) ---
            { pat: 2, bars: 4, bass: 1, solo: 'bassGrooveB', soloType: 'bass' },
            { pat: 3, bars: 3, bass: 2 },
            { pat: 7, bars: 1, bass: 5 },

            // --- Breakdown with master phaser (8 bars) ---
            { pat: 4, bars: 4, bass: 3, masterPhaser: true },
            { pat: 5, bars: 4, bass: 7, masterPhaser: true },

            // --- Scream solo (32 bars) ---
            { pat: 6, bars: 8, bass: 4, solo: 'screamA', soloType: 'scream' },
            { pat: 4, bars: 4, bass: 3 },
            { pat: 8, bars: 8, bass: 6, solo: 'screamB', soloType: 'scream' },
            { pat: 5, bars: 4, bass: 7, solo: 'bassGrooveA', soloType: 'bass' },
            { pat: 6, bars: 4, bass: 7, solo: 'screamC', soloType: 'scream' },
            { pat: 6, bars: 3, bass: 2, solo: 'screamD', soloType: 'scream' },
            { pat: 7, bars: 1, bass: 5 },

            // ═══ ACT III: THE PHASER (52 bars) ═══

            // --- Half-time siren transition (8 bars) ---
            { pat: 9, bars: 4, bass: 8, solo: 'sirenA', soloType: 'siren' },
            { pat: 11, bars: 4, bass: 9, solo: 'sirenB', soloType: 'siren' },

            // --- Phaser solo (32 bars) ---
            { pat: 8, bars: 8, bass: 0, solo: 'phaserA', soloType: 'phaser', masterPhaser: true },
            { pat: 3, bars: 4, bass: 1, masterPhaser: true },
            { pat: 10, bars: 8, bass: 8, solo: 'phaserB', soloType: 'phaser', masterPhaser: true },
            { pat: 6, bars: 8, bass: 9, solo: 'phaserC', soloType: 'phaser' },
            { pat: 12, bars: 4, bass: 10, solo: 'phaserD', soloType: 'phaser' },

            // --- Phaser cooldown (12 bars) ---
            { pat: 9, bars: 8, bass: 0, solo: 'phaserE', soloType: 'phaser', masterPhaser: true },
            { pat: 4, bars: 4, bass: 3, masterPhaser: true },

            // ═══ ACT IV: ESCALATION (48 bars) ═══

            // --- New acid phrases (16 bars) ---
            { pat: 6, bars: 4, bass: 4, solo: 'acidF', soloType: 'acid' },
            { pat: 10, bars: 4, bass: 8, solo: 'acidG', soloType: 'acid' },
            { pat: 6, bars: 4, bass: 2, solo: 'acidH', soloType: 'acid' },
            { pat: 2, bars: 4, bass: 1 },

            // --- Dual breakdown (8 bars) ---
            { pat: 11, bars: 4, bass: 9, masterPhaser: true },
            { pat: 4, bars: 4, bass: 3, masterPhaser: true },

            // --- New scream phrases (16 bars) ---
            { pat: 6, bars: 4, bass: 7, solo: 'screamF', soloType: 'scream' },
            { pat: 12, bars: 4, bass: 10, solo: 'screamG', soloType: 'scream' },
            { pat: 6, bars: 4, bass: 2, solo: 'screamH', soloType: 'scream' },
            { pat: 3, bars: 4, bass: 1 },

            // --- Bass showcase (8 bars) ---
            { pat: 8, bars: 4, bass: 3, solo: 'bassD', soloType: 'bass' },
            { pat: 8, bars: 4, bass: 3, solo: 'bassE', soloType: 'bass' },

            // ═══ ACT V: CLIMAX (68 bars) ═══

            // --- All instruments climax (24 bars) ---
            { pat: 6, bars: 4, bass: 4, solo: 'acidD', soloType: 'acid' },
            { pat: 12, bars: 4, bass: 10, solo: 'screamD', soloType: 'scream' },
            { pat: 10, bars: 4, bass: 9, solo: 'phaserD', soloType: 'phaser' },
            { pat: 6, bars: 4, bass: 2, solo: 'acidC', soloType: 'acid' },
            { pat: 12, bars: 4, bass: 8, solo: 'screamC', soloType: 'scream' },
            { pat: 6, bars: 3, bass: 7, solo: 'phaserC', soloType: 'phaser' },
            { pat: 7, bars: 1, bass: 5 },

            // --- Extended resolution (20 bars) ---
            { pat: 2, bars: 4, bass: 1, solo: 'bassGrooveB', soloType: 'bass' },
            { pat: 6, bars: 4, bass: 4 },
            { pat: 3, bars: 4, bass: 2 },
            { pat: 3, bars: 4, bass: 2, solo: 'acidE', soloType: 'acid' },
            { pat: 0, bars: 3, bass: 0, solo: 'screamE', soloType: 'scream' },
            { pat: 7, bars: 1, bass: 5 },

            // --- Bass coda (24 bars) ---
            { pat: 8, bars: 8, bass: 3, solo: 'bassA', soloType: 'bass' },
            { pat: 4, bars: 4, bass: 3 },
            { pat: 8, bars: 8, bass: 3, solo: 'bassB', soloType: 'bass' },
            { pat: 6, bars: 3, bass: 3, solo: 'bassC', soloType: 'bass' },
            { pat: 7, bars: 1, bass: 5 },
        ];
    }

    start() {
        if (this.playing) return;

        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._buildMasterChain();
            this._createNoiseBuffer();
        }

        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.playing = true;
        this.stepIndex = 0;
        this.barCount = 0;
        this.arrIndex = 0;
        this.barInSection = 0;
        this.nextStepTime = this.ctx.currentTime + 0.05;

        this._startDrone();
        this._startBass();
        this._startMachinery();

        this._interval = setInterval(() => this._scheduler(), 25);
    }

    stop() {
        this.playing = false;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        for (const node of this._continuousNodes) {
            try { node.stop(); } catch (e) { /* already stopped */ }
            try { node.disconnect(); } catch (e) { /* already disconnected */ }
        }
        this._continuousNodes = [];
        this._bassOsc = null;
        this._bassGain = null;
        this._bassFilter = null;
        this._prevAcidNote = 0;
        this._prevScreamNote = 0;
        this._prevBassNote = 0;
        this._prevPhaserNote = 0;
        this._prevSirenNote = 0;
        this._masterPhaserOn = false;
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(
                this.muted ? 0 : 0.45,
                this.ctx.currentTime, 0.05
            );
        }
        return this.muted;
    }

    // ========== Master signal chain ==========

    _buildMasterChain() {
        const ctx = this.ctx;

        this.distortion = ctx.createWaveShaper();
        this.distortion.curve = this._makeDistortionCurve(8);
        this.distortion.oversample = '2x';

        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 4;
        this.compressor.ratio.value = 6;
        this.compressor.attack.value = 0.004;
        this.compressor.release.value = 0.12;

        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.45;

        this.distortion.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(ctx.destination);

        // Master phaser: 4-stage allpass chain (wet path added to dry)
        // Very slow LFO (0.3 Hz) for whole-mix sweep — default off (wet=0)
        const mpLfo = ctx.createOscillator();
        mpLfo.type = 'sine';
        mpLfo.frequency.value = 0.3;

        const mpAllpassFreqs = [600, 1200, 2400, 4800];
        let mpPrev = this.compressor;
        for (const baseFreq of mpAllpassFreqs) {
            const ap = ctx.createBiquadFilter();
            ap.type = 'allpass';
            ap.frequency.value = baseFreq;
            ap.Q.value = 2;
            const lfoDepth = ctx.createGain();
            lfoDepth.gain.value = baseFreq * 0.4;
            mpLfo.connect(lfoDepth);
            lfoDepth.connect(ap.frequency);
            mpPrev.connect(ap);
            mpPrev = ap;
        }

        this._masterPhaserWet = ctx.createGain();
        this._masterPhaserWet.gain.value = 0;
        mpPrev.connect(this._masterPhaserWet);
        this._masterPhaserWet.connect(this.masterGain);
        this._masterPhaserOn = false;

        mpLfo.start();
        this._continuousNodes.push(mpLfo);

        // Solo bus with dotted-8th delay for depth
        this.soloBus = ctx.createGain();
        this.soloBus.gain.value = 1.0;

        const soloDelay = ctx.createDelay(1.0);
        soloDelay.delayTime.value = (60 / this.bpm) * 0.75; // dotted 8th
        const delayFB = ctx.createGain();
        delayFB.gain.value = 0.28;
        const delayLP = ctx.createBiquadFilter();
        delayLP.type = 'lowpass';
        delayLP.frequency.value = 1800; // darken repeats
        const delayWet = ctx.createGain();
        delayWet.gain.value = 0.22;

        this.soloBus.connect(this.distortion);          // dry path
        this.soloBus.connect(soloDelay);                 // into delay
        soloDelay.connect(delayLP);
        delayLP.connect(delayFB);
        delayFB.connect(soloDelay);                      // feedback loop
        delayLP.connect(delayWet);
        delayWet.connect(this.compressor);               // wet → master
    }

    _makeDistortionCurve(amount) {
        // Memoized — only 4 distinct amounts ever requested (20/25/30/35),
        // and each curve is a 176KB Float32Array. Without the cache this
        // function allocated ~MB/sec during scream/bass solos.
        if (!this._distortionCurveCache) this._distortionCurveCache = new Map();
        const cached = this._distortionCurveCache.get(amount);
        if (cached) return cached;

        const n = 44100;
        const curve = new Float32Array(n);
        const deg = Math.PI / 180;
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        this._distortionCurveCache.set(amount, curve);
        return curve;
    }

    _createNoiseBuffer() {
        const len = this.ctx.sampleRate * 2;
        this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }

    // ========== Scheduler with swing ==========

    _scheduler() {
        while (this.nextStepTime < this.ctx.currentTime + 0.3) {
            this._scheduleStep(this.stepIndex, this.nextStepTime);

            const pairDur = this.stepLength * 2;
            if (this.stepIndex % 2 === 0) {
                this.nextStepTime += pairDur * this.swingRatio;
            } else {
                this.nextStepTime += pairDur * (1 - this.swingRatio);
            }

            this.stepIndex++;
            if (this.stepIndex >= 16) {
                this.stepIndex = 0;
                this.barCount++;
                this.barInSection++;
                this._advanceArrangement();
            }
        }
    }

    _advanceArrangement() {
        const section = this.arrangement[this.arrIndex];
        if (this.barInSection >= section.bars) {
            this.barInSection = 0;
            this.arrIndex = (this.arrIndex + 1) % this.arrangement.length;
        }
    }

    _scheduleStep(step, time) {
        const section = this.arrangement[this.arrIndex];
        const pat = this.patBank[section.pat];

        // Drums
        if (pat.kick[step])    this._playKick(time, pat.kick[step]);
        if (pat.clank[step])   this._playClank(time, pat.clank[step]);
        if (pat.hihat[step])   this._playHihat(time, pat.hihat[step]);
        if (pat.openHat[step]) this._playOpenHat(time, pat.openHat[step]);
        if (pat.metal[step])   this._playMetallic(time, pat.metal[step]);

        // Bass
        this._updateBass(step, time, section.bass);

        // Solo (negative values = accented, consecutive notes = slide)
        if (section.solo) {
            const phrase = this.soloBank[section.solo];
            const bar = this.barInSection % phrase.length;
            const rawNote = phrase[bar][step];
            const accented = rawNote < 0;
            const freq = Math.abs(rawNote);

            if (freq > 0) {
                if (section.soloType === 'acid') {
                    this._playAcidNote(time, freq, this._prevAcidNote, accented);
                    this._prevAcidNote = freq;
                } else if (section.soloType === 'scream') {
                    this._playScreamNote(time, freq, this._prevScreamNote, accented);
                    this._prevScreamNote = freq;
                } else if (section.soloType === 'bass') {
                    this._playBassWahNote(time, freq, this._prevBassNote, accented);
                    this._prevBassNote = freq;
                } else if (section.soloType === 'phaser') {
                    this._playPhaserNote(time, freq, this._prevPhaserNote, accented);
                    this._prevPhaserNote = freq;
                } else if (section.soloType === 'siren') {
                    this._playSirenNote(time, freq, this._prevSirenNote, accented);
                    this._prevSirenNote = freq;
                }
            } else {
                if (section.soloType === 'acid') this._prevAcidNote = 0;
                else if (section.soloType === 'scream') this._prevScreamNote = 0;
                else if (section.soloType === 'bass') this._prevBassNote = 0;
                else if (section.soloType === 'phaser') this._prevPhaserNote = 0;
                else if (section.soloType === 'siren') this._prevSirenNote = 0;
            }
        } else {
            this._prevAcidNote = 0;
            this._prevScreamNote = 0;
            this._prevBassNote = 0;
            this._prevPhaserNote = 0;
            this._prevSirenNote = 0;
        }

        // Master phaser toggle on bar boundaries
        if (step === 0 && this._masterPhaserWet) {
            const wantPhaser = !!section.masterPhaser;
            if (wantPhaser !== this._masterPhaserOn) {
                this._masterPhaserOn = wantPhaser;
                this._masterPhaserWet.gain.setTargetAtTime(
                    wantPhaser ? 0.5 : 0, time, 0.3
                );
            }
        }
    }

    /**
     * After all `sources` finish (Web Audio fires `onended` on each), disconnect
     * every node in `nodes` so the per-note graph can be garbage-collected.
     * Without this, transient nodes stay referenced via their connection to the
     * still-live destination bus and accumulate forever — the scheduler runs at
     * 40Hz, so the leak is large and steady (visible even while paused).
     */
    _disposeWhenDone(sources, nodes) {
        let pending = sources.length;
        const localSources = sources;  // shadowed so we can null out below
        const localNodes = nodes;
        const cleanup = () => {
            if (--pending === 0) {
                for (const n of localNodes) {
                    try { n.disconnect(); } catch (e) { /* already disconnected */ }
                }
                // Clear handler refs so the closure (which captures the node
                // arrays) becomes unreachable — otherwise the closure holds
                // ~5-15 audio nodes' worth of references per note, forever.
                for (const s of localSources) s.onended = null;
            }
        };
        for (const s of sources) s.onended = cleanup;
    }

    // ========== Percussion (velocity-scaled) ==========

    _playKick(time, vel) {
        const ctx = this.ctx;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(35, time + 0.07);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.75 * vel, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(55, time);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.5 * vel, time);
        subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

        osc.connect(gain);
        gain.connect(this.distortion);
        sub.connect(subGain);
        subGain.connect(this.distortion);

        osc.start(time);
        osc.stop(time + 0.25);
        sub.start(time);
        sub.stop(time + 0.18);
        this._disposeWhenDone([osc, sub], [osc, gain, sub, subGain]);
    }

    _playClank(time, vel) {
        const ctx = this.ctx;

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3200;
        bp.Q.value = 3;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.55 * vel, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        noise.connect(bp);
        bp.connect(noiseGain);
        noiseGain.connect(this.distortion);

        const ring = ctx.createOscillator();
        ring.type = 'square';
        ring.frequency.value = 185;

        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0.12 * vel, time);
        ringGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        ring.connect(ringGain);
        ringGain.connect(this.distortion);

        noise.start(time);
        noise.stop(time + 0.08);
        ring.start(time);
        ring.stop(time + 0.12);
        this._disposeWhenDone([noise, ring], [noise, bp, noiseGain, ring, ringGain]);
    }

    _playHihat(time, vel) {
        const ctx = this.ctx;

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 9000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.16 * vel, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

        noise.connect(hp);
        hp.connect(gain);
        gain.connect(this.compressor);

        noise.start(time);
        noise.stop(time + 0.04);
        this._disposeWhenDone([noise], [noise, hp, gain]);
    }

    _playOpenHat(time, vel) {
        const ctx = this.ctx;

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 5500;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2 * vel, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

        noise.connect(hp);
        hp.connect(gain);
        gain.connect(this.compressor);

        noise.start(time);
        noise.stop(time + 0.18);
        this._disposeWhenDone([noise], [noise, hp, gain]);
    }

    _playMetallic(time, vel) {
        const ctx = this.ctx;
        const freqs = [347, 563, 891, 1247];
        for (const f of freqs) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = f;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.05 * vel, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

            osc.connect(gain);
            gain.connect(this.compressor);

            osc.start(time);
            osc.stop(time + 0.18);
            this._disposeWhenDone([osc], [osc, gain]);
        }
    }

    // ========== Solo instruments ==========

    _playAcidNote(time, freq, prevFreq, accented) {
        // TB-303 style: sawtooth → resonant lowpass
        // Slides when consecutive notes, accents widen the filter sweep
        const ctx = this.ctx;
        const sliding = prevFreq > 0;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';

        if (sliding) {
            // Portamento glide from previous pitch
            osc.frequency.setValueAtTime(prevFreq, time);
            osc.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
        } else {
            osc.frequency.setValueAtTime(freq, time);
        }

        // Resonant filter — accents get wider sweep + higher Q
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = accented ? 18 : 14;
        const filterPeak = accented ? freq * 16 : (sliding ? freq * 4 : freq * 10);
        filter.frequency.setValueAtTime(filterPeak, time);
        filter.frequency.exponentialRampToValueAtTime(freq * 1.2, time + (accented ? 0.18 : 0.14));

        // Gain — accents louder, slides have softer attack
        const vol = accented ? 0.22 : 0.14;
        const gain = ctx.createGain();
        if (sliding) {
            gain.gain.setValueAtTime(vol * 0.8, time);
            gain.gain.setTargetAtTime(vol * 0.5, time + 0.01, 0.06);
        } else {
            gain.gain.setValueAtTime(vol, time);
            gain.gain.setTargetAtTime(vol * 0.5, time + 0.01, 0.05);
        }
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.soloBus);

        osc.start(time);
        osc.stop(time + 0.25);
        this._disposeWhenDone([osc], [osc, filter, gain]);
    }

    _playScreamNote(time, freq, prevFreq, accented) {
        // Distorted square wave with vibrato + pitch bend
        // Slides on consecutive notes, accents increase distortion + vibrato
        const ctx = this.ctx;
        const sliding = prevFreq > 0;

        const osc = ctx.createOscillator();
        osc.type = 'square';

        if (sliding) {
            osc.frequency.setValueAtTime(prevFreq * 0.97, time);
            osc.frequency.exponentialRampToValueAtTime(freq, time + 0.04);
        } else {
            osc.frequency.setValueAtTime(freq * 0.95, time);
            osc.frequency.exponentialRampToValueAtTime(freq, time + 0.025);
        }

        // Vibrato LFO — kicks in after attack transient
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = accented ? 7 : 5;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.setValueAtTime(0, time);
        lfoDepth.gain.linearRampToValueAtTime(
            freq * (accented ? 0.04 : 0.025), time + 0.06
        );
        lfo.connect(lfoDepth);
        lfoDepth.connect(osc.frequency);

        // Filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = accented ? 8 : 6;
        filter.frequency.setValueAtTime(freq * (accented ? 12 : 8), time);
        filter.frequency.exponentialRampToValueAtTime(freq * 2, time + 0.22);

        // Extra crunch — accents hit harder
        const crunch = ctx.createWaveShaper();
        crunch.curve = this._makeDistortionCurve(accented ? 35 : 25);

        // Gain
        const vol = accented ? 0.14 : 0.08;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.setTargetAtTime(vol * 0.5, time + 0.01, 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);

        osc.connect(filter);
        filter.connect(crunch);
        crunch.connect(gain);
        gain.connect(this.soloBus);

        lfo.start(time);
        lfo.stop(time + 0.32);
        osc.start(time);
        osc.stop(time + 0.32);
        this._disposeWhenDone([osc, lfo], [osc, lfo, lfoDepth, filter, crunch, gain]);
    }

    _playBassWahNote(time, freq, prevFreq, accented) {
        // Fat bass with auto-wah: sawtooth + sub octave → drive → bandpass sweep
        const ctx = this.ctx;
        const sliding = prevFreq > 0;

        // Main voice: sawtooth for harmonics the wah can bite into
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        if (sliding) {
            osc.frequency.setValueAtTime(prevFreq, time);
            osc.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
        } else {
            osc.frequency.setValueAtTime(freq, time);
        }

        // Sub octave for weight
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        if (sliding) {
            sub.frequency.setValueAtTime(prevFreq / 2, time);
            sub.frequency.exponentialRampToValueAtTime(freq / 2, time + 0.06);
        } else {
            sub.frequency.setValueAtTime(freq / 2, time);
        }

        const subGain = ctx.createGain();
        const subVol = accented ? 0.18 : 0.12;
        subGain.gain.setValueAtTime(subVol, time);
        subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

        // Pre-wah overdrive — crank it for rich harmonics the filter can chew on
        const drive = ctx.createWaveShaper();
        drive.curve = this._makeDistortionCurve(accented ? 30 : 20);

        // WAH FILTER: high-Q bandpass with big sweep for that vocal quack
        const wah = ctx.createBiquadFilter();
        wah.type = 'bandpass';
        wah.Q.value = accented ? 16 : 12;
        const wahLow = freq * 0.8;
        const wahPeak = accented ? freq * 24 : freq * 16;
        // Double sweep: open → close → re-open for "wah-wah" shape
        wah.frequency.setValueAtTime(wahLow, time);
        wah.frequency.exponentialRampToValueAtTime(wahPeak, time + 0.06);
        wah.frequency.exponentialRampToValueAtTime(freq * 2, time + 0.14);
        wah.frequency.exponentialRampToValueAtTime(wahPeak * 0.6, time + 0.22);
        wah.frequency.exponentialRampToValueAtTime(wahLow, time + 0.35);

        // LFO wobble — deep and obvious
        const wahLFO = ctx.createOscillator();
        wahLFO.type = 'sine';
        wahLFO.frequency.value = accented ? 5.5 : 3.5;
        const wahLFODepth = ctx.createGain();
        wahLFODepth.gain.value = freq * 6;
        wahLFO.connect(wahLFODepth);
        wahLFODepth.connect(wah.frequency);

        // Output gain — louder to cut through
        const vol = accented ? 0.34 : 0.24;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.setTargetAtTime(vol * 0.6, time + 0.02, 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

        // Routing: osc → drive → wah → gain → soloBus
        osc.connect(drive);
        drive.connect(wah);
        sub.connect(subGain);
        subGain.connect(wah);
        wah.connect(gain);
        gain.connect(this.soloBus);

        wahLFO.start(time);
        wahLFO.stop(time + 0.38);
        osc.start(time);
        osc.stop(time + 0.38);
        sub.start(time);
        sub.stop(time + 0.38);
        this._disposeWhenDone(
            [osc, sub, wahLFO],
            [osc, sub, subGain, drive, wah, wahLFO, wahLFODepth, gain]
        );
    }

    _playPhaserNote(time, freq, prevFreq, accented) {
        // Triangle oscillator + 6-stage allpass chain with shared LFO for shimmery phaser sweep
        const ctx = this.ctx;
        const sliding = prevFreq > 0;

        const osc = ctx.createOscillator();
        osc.type = 'triangle';

        if (sliding) {
            osc.frequency.setValueAtTime(prevFreq, time);
            osc.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
        } else {
            osc.frequency.setValueAtTime(freq, time);
        }

        // Shared LFO sweeping allpass frequencies
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = accented ? 2.5 : 1.2;

        // 6-stage allpass chain — staggered base frequencies
        const allpassFreqs = [800, 1100, 1400, 1700, 2000, 2300];
        const apNodes = [];
        const lfoDepthNodes = [];
        let prev = osc;
        for (const baseFreq of allpassFreqs) {
            const ap = ctx.createBiquadFilter();
            ap.type = 'allpass';
            ap.frequency.value = baseFreq;
            ap.Q.value = 5;
            const lfoDepth = ctx.createGain();
            lfoDepth.gain.value = baseFreq * 0.5;
            lfo.connect(lfoDepth);
            lfoDepth.connect(ap.frequency);
            prev.connect(ap);
            prev = ap;
            apNodes.push(ap);
            lfoDepthNodes.push(lfoDepth);
        }

        // Dry/wet mix merged into output
        const dryGain = ctx.createGain();
        dryGain.gain.value = 0.45;
        osc.connect(dryGain);

        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.55;
        prev.connect(wetGain);

        const vol = accented ? 0.20 : 0.14;
        const output = ctx.createGain();
        if (sliding) {
            output.gain.setValueAtTime(vol * 0.8, time);
            output.gain.setTargetAtTime(vol * 0.5, time + 0.02, 0.12);
        } else {
            output.gain.setValueAtTime(vol, time);
            output.gain.setTargetAtTime(vol * 0.6, time + 0.02, 0.12);
        }
        output.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

        dryGain.connect(output);
        wetGain.connect(output);
        output.connect(this.soloBus);

        lfo.start(time);
        lfo.stop(time + 0.4);
        osc.start(time);
        osc.stop(time + 0.4);
        this._disposeWhenDone(
            [osc, lfo],
            [osc, lfo, ...apNodes, ...lfoDepthNodes, dryGain, wetGain, output]
        );
    }

    _playSirenNote(time, freq, prevFreq, accented) {
        // FM synthesis: sine carrier + sine modulator at 3.5x ratio for metallic howl
        // Bandpass filter sweep for nasal industrial tone, pitch sweep on attack
        const ctx = this.ctx;
        const sliding = prevFreq > 0;

        const carrier = ctx.createOscillator();
        carrier.type = 'sine';

        const modulator = ctx.createOscillator();
        modulator.type = 'sine';

        // FM modulation depth
        const modGain = ctx.createGain();
        modGain.gain.value = freq * (accented ? 1.5 : 1.0);
        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        if (sliding) {
            carrier.frequency.setValueAtTime(prevFreq, time);
            carrier.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
            modulator.frequency.setValueAtTime(prevFreq * 3.5, time);
            modulator.frequency.exponentialRampToValueAtTime(freq * 3.5, time + 0.06);
        } else {
            // Pitch sweep up on attack for alarm effect
            carrier.frequency.setValueAtTime(freq * 0.7, time);
            carrier.frequency.exponentialRampToValueAtTime(freq, time + 0.08);
            modulator.frequency.setValueAtTime(freq * 3.5 * 0.7, time);
            modulator.frequency.exponentialRampToValueAtTime(freq * 3.5, time + 0.08);
        }

        // Bandpass sweep for nasal industrial tone
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = accented ? 8 : 5;
        bp.frequency.setValueAtTime(freq * 2, time);
        bp.frequency.exponentialRampToValueAtTime(freq * 8, time + 0.1);
        bp.frequency.exponentialRampToValueAtTime(freq * 3, time + 0.25);

        const vol = accented ? 0.16 : 0.10;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.setTargetAtTime(vol * 0.5, time + 0.02, 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

        carrier.connect(bp);
        bp.connect(gain);
        gain.connect(this.soloBus);

        carrier.start(time);
        carrier.stop(time + 0.3);
        modulator.start(time);
        modulator.stop(time + 0.3);
        this._disposeWhenDone(
            [carrier, modulator],
            [carrier, modulator, modGain, bp, gain]
        );
    }

    // ========== Continuous layers ==========

    _startBass() {
        const ctx = this.ctx;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        lp.Q.value = 5;

        const gain = ctx.createGain();
        gain.gain.value = 0.22;

        osc.connect(lp);
        lp.connect(gain);
        gain.connect(this.distortion);

        osc.start();
        this._continuousNodes.push(osc);
        this._bassOsc = osc;
        this._bassGain = gain;
        this._bassFilter = lp;
    }

    _updateBass(step, time, bassProgIdx) {
        if (!this._bassOsc) return;
        // Duck continuous bass when bass wah solo is playing
        const section = this.arrangement[this.arrIndex];
        const ducked = section.soloType === 'bass';
        const prog = this.bassProgs[bassProgIdx];
        for (const [s, freq] of prog) {
            if (step === s) {
                this._bassOsc.frequency.setValueAtTime(freq, time);
                this._bassFilter.frequency.setValueAtTime(ducked ? 100 : 350, time);
                this._bassFilter.frequency.exponentialRampToValueAtTime(ducked ? 60 : 180, time + 0.1);
                this._bassGain.gain.setValueAtTime(ducked ? 0.06 : 0.28, time);
                this._bassGain.gain.setTargetAtTime(ducked ? 0.03 : 0.16, time + 0.02, 0.08);
            }
        }
    }

    _startDrone() {
        const ctx = this.ctx;

        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = 27.5;

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.value = 27.8;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 80;
        lp.Q.value = 2;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 40;
        lfo.connect(lfoGain);
        lfoGain.connect(lp.frequency);

        const gain = ctx.createGain();
        gain.gain.value = 0.12;

        osc1.connect(lp);
        osc2.connect(lp);
        lp.connect(gain);
        gain.connect(this.distortion);

        osc1.start();
        osc2.start();
        lfo.start();

        this._continuousNodes.push(osc1, osc2, lfo);
    }

    _startMachinery() {
        const ctx = this.ctx;

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        noise.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 400;
        bp.Q.value = 0.8;

        const amOsc = ctx.createOscillator();
        amOsc.type = 'sine';
        amOsc.frequency.value = 0.3;

        const amGain = ctx.createGain();
        amGain.gain.value = 0;

        const amDepth = ctx.createGain();
        amDepth.gain.value = 0.04;

        amOsc.connect(amDepth);
        amDepth.connect(amGain.gain);

        noise.connect(bp);
        bp.connect(amGain);
        amGain.connect(this.compressor);

        noise.start();
        amOsc.start();

        this._continuousNodes.push(noise, amOsc);
    }

    // ========== Weapon SFX ==========

    playCrystalSound() {
        if (!this.ctx || this.muted) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;

        // 10 variations — same crystalline character, different pitch/timbre.
        // Picked at random per pickup so consecutive collects don't sound identical.
        const variations = [
            { freqs: [660, 990, 1320],   peaks: [0.07, 0.04, 0.02], type: 'sine'     }, // warm low
            { freqs: [880, 1320, 1760],  peaks: [0.07, 0.04, 0.02], type: 'sine'     }, // standard
            { freqs: [1100, 1650, 2200], peaks: [0.06, 0.03, 0.02], type: 'sine'     }, // bright high
            { freqs: [880, 1108, 1318],  peaks: [0.06, 0.05, 0.04], type: 'sine'     }, // major triad
            { freqs: [880, 1047, 1318],  peaks: [0.06, 0.05, 0.04], type: 'sine'     }, // minor triad
            { freqs: [880, 1318, 1760],  peaks: [0.06, 0.05, 0.04], type: 'sine'     }, // perfect fifth
            { freqs: [660, 1320, 2640],  peaks: [0.07, 0.04, 0.02], type: 'sine'     }, // octave stack
            { freqs: [880, 893, 1320],   peaks: [0.05, 0.05, 0.03], type: 'sine'     }, // detuned shimmer
            { freqs: [780, 1170, 1560],  peaks: [0.07, 0.04, 0.02], type: 'triangle' }, // softer triangle
            { freqs: [990, 1485, 1980],  peaks: [0.06, 0.04, 0.02], type: 'sine'     }, // raised D
        ];
        const v = variations[Math.floor(Math.random() * variations.length)];

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2800;
        lp.Q.value = 0.7;
        lp.connect(ctx.destination);

        let pending = v.freqs.length;
        for (let i = 0; i < v.freqs.length; i++) {
            const osc = ctx.createOscillator();
            osc.type = v.type;
            osc.frequency.setValueAtTime(v.freqs[i], t);
            osc.frequency.exponentialRampToValueAtTime(v.freqs[i] * 1.08, t + 0.5);

            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(v.peaks[i], t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

            osc.connect(g);
            g.connect(lp);
            osc.start(t);
            osc.stop(t + 0.65);
            osc.onended = () => {
                osc.disconnect();
                g.disconnect();
                if (--pending === 0) lp.disconnect();
            };
        }
    }

    playGunSound() {
        if (!this.ctx || this.muted) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 400;

        osc.connect(hp);
        hp.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.06);
        osc.onended = () => { osc.disconnect(); hp.disconnect(); gain.disconnect(); };
    }

    playRocketSound() {
        if (!this.ctx || this.muted) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(600, t);
        bp.frequency.exponentialRampToValueAtTime(200, t + 0.3);
        bp.Q.value = 1;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        noise.connect(bp);
        bp.connect(gain);
        gain.connect(ctx.destination);

        noise.start(t);
        noise.stop(t + 0.3);
        noise.onended = () => { noise.disconnect(); bp.disconnect(); gain.disconnect(); };
    }

    playExplosionSound() {
        if (!this.ctx || this.muted) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.5, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2000, t);
        lp.frequency.exponentialRampToValueAtTime(100, t + 0.4);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        noise.connect(lp);
        lp.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.4);
        noise.start(t);
        noise.stop(t + 0.4);
        osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
        noise.onended = () => {
            noise.disconnect(); lp.disconnect(); noiseGain.disconnect();
        };
    }
}
