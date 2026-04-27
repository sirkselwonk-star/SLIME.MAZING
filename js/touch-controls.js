// touch-controls.js — Dual-stick drone-style mobile touch controls

export class TouchControlsManager {
    constructor(controls) {
        this.controls = controls;
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.enabled = false;

        // Left stick state (MOVE — translation)
        this.leftTouchId = null;
        this.leftOrigin = { x: 0, y: 0 };
        this.leftPos = { x: 0, y: 0 };

        // Right stick state (LOOK — rotation, rate-based like a drone)
        this.rightTouchId = null;
        this.rightOrigin = { x: 0, y: 0 };
        this.rightPos = { x: 0, y: 0 };

        // Shared stick config
        this.stickRadius = 60;
        this.deadzone = 0.15;
        this.lookRate = 18; // pixels per frame at full deflection, fed into mouse pipeline

        // Layout
        this.isLandscape = true;
        this.overlay = null;
        this.leftZone = null;
        this.leftBase = null;
        this.leftKnob = null;
        this.leftLabel = null;
        this.rightZone = null;
        this.rightBase = null;
        this.rightKnob = null;
        this.rightLabel = null;
        this.buttons = {};

        // Callbacks (wired by main.js)
        this.onEyesBleed = null;
        this.onMute = null;
        this.onPause = null;

        if (this.isTouchDevice) {
            this._createOverlay();
            this._bindTouchEvents();
        }
    }

    // --- DOM creation ---

    _createOverlay() {
        const o = document.createElement('div');
        o.id = 'touch-overlay';
        o.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 40; pointer-events: none; display: none;
            user-select: none; -webkit-user-select: none;
        `;

        // Left stick zone
        this.leftZone = this._createZone();
        const leftStick = this._createStick('#4ade80');
        this.leftBase = leftStick.base;
        this.leftKnob = leftStick.knob;
        this.leftLabel = leftStick.label;
        this.leftLabel.textContent = 'MOVE';
        this.leftZone.appendChild(this.leftBase);
        o.appendChild(this.leftZone);

        // Right stick zone
        this.rightZone = this._createZone();
        const rightStick = this._createStick('#22d3ee');
        this.rightBase = rightStick.base;
        this.rightKnob = rightStick.knob;
        this.rightLabel = rightStick.label;
        this.rightLabel.textContent = 'LOOK';
        this.rightZone.appendChild(this.rightBase);
        o.appendChild(this.rightZone);

        // Action buttons
        this._createButtons(o);

        document.body.appendChild(o);
        this.overlay = o;
        this.updateLayout();
    }

    _createZone() {
        const zone = document.createElement('div');
        zone.style.cssText = `
            position: absolute; pointer-events: auto; touch-action: none;
        `;
        return zone;
    }

    _createStick(color) {
        // Base ring (hidden until touch)
        const base = document.createElement('div');
        base.style.cssText = `
            position: absolute; width: 130px; height: 130px;
            border: 2.5px solid ${color}55;
            border-radius: 50%; display: none;
            transform: translate(-50%, -50%);
            background: ${color}0d;
            box-shadow: 0 0 20px ${color}15;
        `;

        // Knob
        const knob = document.createElement('div');
        knob.style.cssText = `
            position: absolute; width: 58px; height: 58px;
            background: ${color}44;
            border: 2.5px solid ${color}99;
            border-radius: 50%;
            left: 50%; top: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 12px ${color}30;
        `;

        // Label (shows above the stick when active)
        const label = document.createElement('div');
        label.style.cssText = `
            position: absolute; left: 50%; top: -22px;
            transform: translateX(-50%);
            font-family: 'Courier New', monospace;
            font-size: 11px; font-weight: bold;
            letter-spacing: 3px; color: ${color}aa;
            text-shadow: 0 0 6px ${color}40;
            pointer-events: none; white-space: nowrap;
        `;

        base.appendChild(knob);
        base.appendChild(label);

        return { base, knob, label };
    }

    _createButton(label, color, size = 56) {
        const btn = document.createElement('div');
        btn.style.cssText = `
            position: absolute; width: ${size}px; height: ${size}px;
            border-radius: 50%; pointer-events: auto; touch-action: none;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Courier New', monospace; font-size: 10px; font-weight: bold;
            color: ${color}; border: 2px solid ${color};
            background: rgba(0,0,0,0.35); user-select: none;
            -webkit-user-select: none; opacity: 0.7;
        `;
        btn.textContent = label;
        return btn;
    }

    _createButtons(overlay) {
        this.buttons.gun = this._createButton('GUN', '#4ade80');
        this.buttons.rocket = this._createButton('RKT', '#fb923c');
        this.buttons.up = this._createButton('UP', '#22d3ee');
        this.buttons.down = this._createButton('DWN', '#22d3ee');
        this.buttons.eyesBleed = this._createButton('EYE', '#f472b6');
        this.buttons.mute = this._createButton('MUT', '#888');
        this.buttons.pause = this._createButton('| |', '#888', 44);

        for (const btn of Object.values(this.buttons)) {
            overlay.appendChild(btn);
        }
    }

    // --- Event binding ---

    _bindTouchEvents() {
        // Left stick zone
        this.leftZone.addEventListener('touchstart', e => this._onStickStart(e, 'left'), { passive: false });
        this.leftZone.addEventListener('touchmove', e => this._onStickMove(e, 'left'), { passive: false });
        this.leftZone.addEventListener('touchend', e => this._onStickEnd(e, 'left'), { passive: false });
        this.leftZone.addEventListener('touchcancel', e => this._onStickEnd(e, 'left'), { passive: false });

        // Right stick zone
        this.rightZone.addEventListener('touchstart', e => this._onStickStart(e, 'right'), { passive: false });
        this.rightZone.addEventListener('touchmove', e => this._onStickMove(e, 'right'), { passive: false });
        this.rightZone.addEventListener('touchend', e => this._onStickEnd(e, 'right'), { passive: false });
        this.rightZone.addEventListener('touchcancel', e => this._onStickEnd(e, 'right'), { passive: false });

        // Buttons
        this._bindButton(this.buttons.gun, 'gun');
        this._bindButton(this.buttons.rocket, 'rocket');
        this._bindButton(this.buttons.up, 'up');
        this._bindButton(this.buttons.down, 'down');
        this._bindButton(this.buttons.eyesBleed, 'eyesBleed');
        this._bindButton(this.buttons.mute, 'mute');
        this._bindButton(this.buttons.pause, 'pause');
    }

    _bindButton(el, action) {
        el.addEventListener('touchstart', e => {
            e.preventDefault();
            e.stopPropagation();
            el.style.opacity = '1';
            el.style.background = 'rgba(255,255,255,0.15)';

            if (action === 'gun') {
                this.controls.gunHeld = true;
                this.controls.firing.gun = true;
            } else if (action === 'rocket') {
                this.controls.firing.rocket = true;
            } else if (action === 'up') {
                this.controls.keys['Space'] = true;
            } else if (action === 'down') {
                this.controls.keys['ShiftLeft'] = true;
            } else if (action === 'eyesBleed') {
                if (this.onEyesBleed) this.onEyesBleed();
            } else if (action === 'mute') {
                if (this.onMute) this.onMute();
            } else if (action === 'pause') {
                if (this.onPause) this.onPause();
            }
        }, { passive: false });

        el.addEventListener('touchend', e => {
            e.preventDefault();
            e.stopPropagation();
            el.style.opacity = '0.7';
            el.style.background = 'rgba(0,0,0,0.35)';

            if (action === 'gun') this.controls.gunHeld = false;
            if (action === 'up') this.controls.keys['Space'] = false;
            if (action === 'down') this.controls.keys['ShiftLeft'] = false;
        }, { passive: false });

        el.addEventListener('touchcancel', e => {
            el.style.opacity = '0.7';
            el.style.background = 'rgba(0,0,0,0.35)';
            if (action === 'gun') this.controls.gunHeld = false;
            if (action === 'up') this.controls.keys['Space'] = false;
            if (action === 'down') this.controls.keys['ShiftLeft'] = false;
        }, { passive: false });
    }

    // --- Generic stick handlers (shared by left and right) ---

    _getStickState(side) {
        return side === 'left'
            ? { touchId: this.leftTouchId, origin: this.leftOrigin, pos: this.leftPos, base: this.leftBase, knob: this.leftKnob }
            : { touchId: this.rightTouchId, origin: this.rightOrigin, pos: this.rightPos, base: this.rightBase, knob: this.rightKnob };
    }

    _setTouchId(side, id) {
        if (side === 'left') this.leftTouchId = id;
        else this.rightTouchId = id;
    }

    _onStickStart(e, side) {
        e.preventDefault();
        const s = this._getStickState(side);
        if (s.touchId !== null) return;

        const t = e.changedTouches[0];
        this._setTouchId(side, t.identifier);
        s.origin.x = t.clientX;
        s.origin.y = t.clientY;
        s.pos.x = 0;
        s.pos.y = 0;

        s.base.style.display = 'block';
        s.base.style.left = t.clientX + 'px';
        s.base.style.top = t.clientY + 'px';
        s.knob.style.transform = 'translate(-50%, -50%)';
    }

    _onStickMove(e, side) {
        e.preventDefault();
        const s = this._getStickState(side);

        for (const t of e.changedTouches) {
            if (t.identifier !== s.touchId) continue;

            let dx = t.clientX - s.origin.x;
            let dy = t.clientY - s.origin.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > this.stickRadius) {
                dx = (dx / dist) * this.stickRadius;
                dy = (dy / dist) * this.stickRadius;
            }

            s.pos.x = dx / this.stickRadius;
            s.pos.y = dy / this.stickRadius;

            s.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
    }

    _onStickEnd(e, side) {
        const s = this._getStickState(side);

        for (const t of e.changedTouches) {
            if (t.identifier !== s.touchId) continue;
            this._setTouchId(side, null);
            s.pos.x = 0;
            s.pos.y = 0;
            s.base.style.display = 'none';
            s.knob.style.transform = 'translate(-50%, -50%)';
        }
    }

    // --- Public API ---

    show() {
        if (this.overlay) {
            this.overlay.style.display = 'block';
            this.enabled = true;
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
            this.enabled = false;
        }
    }

    update() {
        if (!this.enabled) return;

        // --- Left stick → movement thrust (with deadzone remap) ---
        const lx = this.leftPos.x;
        const ly = this.leftPos.y;
        const lMag = Math.sqrt(lx * lx + ly * ly);

        if (lMag < this.deadzone) {
            this.controls.touchThrust.x = 0;
            this.controls.touchThrust.y = 0;
        } else {
            const remapped = (lMag - this.deadzone) / (1 - this.deadzone);
            const scale = remapped / lMag;
            this.controls.touchThrust.x = lx * scale;
            this.controls.touchThrust.y = ly * scale;
        }

        // --- Right stick → look rate (drone-style: hold = keep turning) ---
        const rx = this.rightPos.x;
        const ry = this.rightPos.y;
        const rMag = Math.sqrt(rx * rx + ry * ry);

        if (rMag > this.deadzone) {
            const remapped = (rMag - this.deadzone) / (1 - this.deadzone);
            const scale = remapped / rMag;
            // Feed rate into mouse delta each frame — controls.update() smooths it
            this.controls.mouseDX += rx * scale * this.lookRate;
            this.controls.mouseDY += ry * scale * this.lookRate;
        }
    }

    updateLayout() {
        if (!this.overlay) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        this.isLandscape = w > h;

        if (this.isLandscape) {
            this._layoutLandscape(w, h);
        } else {
            this._layoutPortrait(w, h);
        }
    }

    _layoutLandscape(w, h) {
        // Left stick zone: left 35%
        this.leftZone.style.cssText = `
            position: absolute; left: 0; top: 0; width: 35%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;

        // Right stick zone: right 35%
        this.rightZone.style.cssText = `
            position: absolute; right: 0; top: 0; width: 35%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;

        // Buttons — center column between the two sticks
        const margin = 14;
        const bSize = 56;
        const centerX = Math.floor(w / 2);
        const bottomBase = h - margin - bSize;

        // Fire buttons — center bottom
        this._posBtn(this.buttons.gun, centerX + 4, bottomBase);
        this._posBtn(this.buttons.rocket, centerX + 4, bottomBase - bSize - margin);
        // Vertical — center, above fire
        this._posBtn(this.buttons.up, centerX - bSize - margin + 4, bottomBase - bSize - margin);
        this._posBtn(this.buttons.down, centerX - bSize - margin + 4, bottomBase);
        // Utility — top center
        this._posBtn(this.buttons.eyesBleed, centerX - bSize - margin + 4, margin);
        this._posBtn(this.buttons.mute, centerX + 4, margin);
        // Pause — top right corner
        this._posBtn(this.buttons.pause, w - margin - 44, margin);
    }

    _layoutPortrait(w, h) {
        const gameH = Math.floor(w / (16 / 9));
        const barH = h - gameH;
        const controlTop = gameH;

        // Left stick zone: left half of bottom bar
        this.leftZone.style.cssText = `
            position: absolute; left: 0; top: ${controlTop}px;
            width: 40%; height: ${barH}px;
            pointer-events: auto; touch-action: none;
        `;

        // Right stick zone: right half of bottom bar
        this.rightZone.style.cssText = `
            position: absolute; right: 0; top: ${controlTop}px;
            width: 40%; height: ${barH}px;
            pointer-events: auto; touch-action: none;
        `;

        // Buttons — center strip of bottom bar
        const margin = 10;
        const bSize = 50;
        const centerX = Math.floor(w / 2) - Math.floor(bSize / 2);
        const bottomBase = h - margin - bSize;

        this._posBtn(this.buttons.gun, centerX, bottomBase);
        this._posBtn(this.buttons.rocket, centerX, bottomBase - bSize - margin);
        this._posBtn(this.buttons.up, centerX, bottomBase - (bSize + margin) * 2);
        this._posBtn(this.buttons.down, centerX, bottomBase - (bSize + margin) * 3);
        this._posBtn(this.buttons.eyesBleed, centerX - bSize - margin, bottomBase);
        this._posBtn(this.buttons.mute, centerX + bSize + margin, bottomBase);
        // Pause — top right of game viewport
        this._posBtn(this.buttons.pause, w - margin - 44, margin);
    }

    _posBtn(el, x, y) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }
}
