// audio.js — Procedural industrial soundtrack (Web Audio API)
// 132-bar arrangement (~4:04) with swing, slides, accents, delay, acid + scream + bass wah solos

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
        };

        // ===== 132-bar arrangement (~4:04) =====
        // solo: key into soloBank, soloType: instrument selector
        // Negative notes in phrases = accented, consecutive notes = portamento slide
        this.arrangement = [
            // --- Intro & build (8 bars) ---
            { pat: 0, bars: 2, bass: 0 },
            { pat: 1, bars: 2, bass: 1 },
            { pat: 2, bars: 4, bass: 1 },

            // --- Acid solo (32 bars) ---
            { pat: 8, bars: 8, bass: 0, solo: 'acidA', soloType: 'acid' },   // opening x2
            { pat: 3, bars: 4, bass: 1 },                                     // breathe
            { pat: 6, bars: 8, bass: 2, solo: 'acidB', soloType: 'acid' },   // climbing x2
            { pat: 2, bars: 4, bass: 4 },                                     // breathe
            { pat: 6, bars: 4, bass: 4, solo: 'acidC', soloType: 'acid' },   // fast runs
            { pat: 6, bars: 3, bass: 7, solo: 'acidD', soloType: 'acid' },   // peak
            { pat: 7, bars: 1, bass: 5 },                                     // fill

            // --- Groove (8 bars) ---
            { pat: 2, bars: 4, bass: 1 },
            { pat: 3, bars: 3, bass: 2 },
            { pat: 7, bars: 1, bass: 5 },

            // --- Breakdown (8 bars) ---
            { pat: 4, bars: 4, bass: 3 },
            { pat: 5, bars: 4, bass: 7 },

            // --- Scream solo (32 bars) ---
            { pat: 6, bars: 8, bass: 4, solo: 'screamA', soloType: 'scream' }, // attacks x2
            { pat: 4, bars: 4, bass: 3 },                                       // breathe
            { pat: 8, bars: 8, bass: 6, solo: 'screamB', soloType: 'scream' }, // wail x2
            { pat: 5, bars: 4, bass: 7 },                                       // breathe
            { pat: 6, bars: 4, bass: 7, solo: 'screamC', soloType: 'scream' }, // rapid fire
            { pat: 6, bars: 3, bass: 2, solo: 'screamD', soloType: 'scream' }, // chaos
            { pat: 7, bars: 1, bass: 5 },                                       // fill

            // --- Climax & resolution (20 bars) ---
            { pat: 2, bars: 4, bass: 1 },
            { pat: 6, bars: 4, bass: 4 },
            { pat: 3, bars: 4, bass: 2 },
            { pat: 3, bars: 4, bass: 2, solo: 'acidE', soloType: 'acid' },     // acid cooldown
            { pat: 0, bars: 3, bass: 0, solo: 'screamE', soloType: 'scream' }, // scream fade
            { pat: 7, bars: 1, bass: 5 },

            // --- Bass wah solo (24 bars) ---
            { pat: 8, bars: 8, bass: 3, solo: 'bassA', soloType: 'bass' },     // funky x2
            { pat: 4, bars: 4, bass: 3 },                                       // breathe
            { pat: 8, bars: 8, bass: 3, solo: 'bassB', soloType: 'bass' },     // deep pocket x2
            { pat: 6, bars: 3, bass: 3, solo: 'bassC', soloType: 'bass' },     // build to loop
            { pat: 7, bars: 1, bass: 5 },                                       // fill → restart
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
        }
        this._continuousNodes = [];
        this._bassOsc = null;
        this._bassGain = null;
        this._bassFilter = null;
        this._prevAcidNote = 0;
        this._prevScreamNote = 0;
        this._prevBassNote = 0;
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
        const n = 44100;
        const curve = new Float32Array(n);
        const deg = Math.PI / 180;
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
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
        while (this.nextStepTime < this.ctx.currentTime + 0.1) {
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
                }
            } else {
                if (section.soloType === 'acid') this._prevAcidNote = 0;
                else if (section.soloType === 'scream') this._prevScreamNote = 0;
                else if (section.soloType === 'bass') this._prevBassNote = 0;
            }
        } else {
            this._prevAcidNote = 0;
            this._prevScreamNote = 0;
            this._prevBassNote = 0;
        }
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
    }
}
