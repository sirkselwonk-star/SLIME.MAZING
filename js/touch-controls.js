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
        this.stickRadius = 45;
        this.deadzone = 0.08;
        this.lookRate = 24; // pixels per frame at full deflection, fed into mouse pipeline

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

        // Touch zones (capture touch input — invisible, cover their half)
        this.leftZone = this._createZone();
        this.rightZone = this._createZone();
        o.appendChild(this.leftZone);
        o.appendChild(this.rightZone);

        // Stick visuals (fixed position, children of overlay for absolute positioning)
        const leftStick = this._createStick('#4ade80');
        this.leftBase = leftStick.base;
        this.leftKnob = leftStick.knob;
        this.leftLabel = leftStick.label;
        this.leftLabel.textContent = 'MOVE';
        o.appendChild(this.leftBase);

        const rightStick = this._createStick('#22d3ee');
        this.rightBase = rightStick.base;
        this.rightKnob = rightStick.knob;
        this.rightLabel = rightStick.label;
        this.rightLabel.textContent = 'LOOK';
        o.appendChild(this.rightBase);

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
        // Base ring — always visible at fixed position
        const base = document.createElement('div');
        base.style.cssText = `
            position: absolute; width: 100px; height: 100px;
            border: 2px solid ${color}55;
            border-radius: 50%;
            background: ${color}0d;
            box-shadow: 0 0 16px ${color}15;
            pointer-events: none;
        `;

        // Knob
        const knob = document.createElement('div');
        knob.style.cssText = `
            position: absolute; width: 44px; height: 44px;
            background: ${color}44;
            border: 2px solid ${color}99;
            border-radius: 50%;
            left: 50%; top: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 10px ${color}30;
            pointer-events: none;
        `;

        // Label — always visible above the base
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
        this.buttons.eyesBleed = this._createButton('EYE', '#f472b6', 44);
        this.buttons.mute = this._createButton('MUT', '#888', 44);
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

    _getBaseCenter(base) {
        const rect = base.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    _onStickStart(e, side) {
        e.preventDefault();
        const s = this._getStickState(side);
        if (s.touchId !== null) return;

        const t = e.changedTouches[0];
        this._setTouchId(side, t.identifier);

        // Origin is always the fixed base center
        const center = this._getBaseCenter(s.base);
        s.origin.x = center.x;
        s.origin.y = center.y;

        // Immediately compute deflection from where the touch landed
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

    _posStick(base, cx, cy) {
        base.style.left = (cx - 50) + 'px';
        base.style.top = (cy - 50) + 'px';
    }

    _getViewport(w, h) {
        const aspect = 16 / 9;
        const winAspect = w / h;
        let vpW, vpH;
        if (winAspect > aspect) {
            vpH = h; vpW = Math.floor(h * aspect);
        } else {
            vpW = w; vpH = Math.floor(w / aspect);
        }
        return {
            vpW, vpH,
            offsetX: Math.floor((w - vpW) / 2),
            offsetY: Math.floor((h - vpH) / 2)
        };
    }

    _layoutLandscape(w, h) {
        const { vpW, offsetX, offsetY } = this._getViewport(w, h);
        const stickY = h - 80;
        const leftStickX = 90;
        const rightStickX = w - 90;

        // Sticks — bottom corners
        this._posStick(this.leftBase, leftStickX, stickY);
        this._posStick(this.rightBase, rightStickX, stickY);

        // Touch zones
        this.leftZone.style.cssText = `
            position: absolute; left: 0; top: 0; width: 35%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;
        this.rightZone.style.cssText = `
            position: absolute; right: 0; top: 0; width: 35%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;

        // Action buttons — center column
        const margin = 14;
        const bSize = 56;
        const centerX = Math.floor(w / 2);
        const bottomBase = h - margin - bSize;

        this._posBtn(this.buttons.gun, centerX + 4, bottomBase);
        this._posBtn(this.buttons.rocket, centerX + 4, bottomBase - bSize - margin);
        this._posBtn(this.buttons.up, centerX - bSize - margin + 4, bottomBase - bSize - margin);
        this._posBtn(this.buttons.down, centerX - bSize - margin + 4, bottomBase);

        // Option buttons — above each stick, in the black bar outside game viewport
        // Left side: EYE + MUT above left stick
        const optY = stickY - 100 - 16; // above the stick base
        const optSize = 44;
        this._posBtn(this.buttons.eyesBleed, leftStickX - optSize - 6, optY);
        this._posBtn(this.buttons.mute, leftStickX + 6, optY);
        // Pause — above right stick
        this._posBtn(this.buttons.pause, rightStickX - 22, optY);
    }

    _layoutPortrait(w, h) {
        const { vpH, offsetY } = this._getViewport(w, h);
        const controlTop = offsetY + vpH; // bottom edge of game viewport
        const barH = h - controlTop;
        const stickY = controlTop + Math.floor(barH * 0.6);
        const leftStickX = 80;
        const rightStickX = w - 80;

        // Sticks — lower portion of bottom bar
        this._posStick(this.leftBase, leftStickX, stickY);
        this._posStick(this.rightBase, rightStickX, stickY);

        // Touch zones
        this.leftZone.style.cssText = `
            position: absolute; left: 0; top: ${controlTop}px;
            width: 40%; height: ${barH}px;
            pointer-events: auto; touch-action: none;
        `;
        this.rightZone.style.cssText = `
            position: absolute; right: 0; top: ${controlTop}px;
            width: 40%; height: ${barH}px;
            pointer-events: auto; touch-action: none;
        `;

        // Action buttons — center strip
        const margin = 10;
        const bSize = 50;
        const centerX = Math.floor(w / 2) - Math.floor(bSize / 2);
        const bottomBase = h - margin - bSize;

        this._posBtn(this.buttons.gun, centerX, bottomBase);
        this._posBtn(this.buttons.rocket, centerX, bottomBase - bSize - margin);
        this._posBtn(this.buttons.up, centerX, bottomBase - (bSize + margin) * 2);
        this._posBtn(this.buttons.down, centerX, bottomBase - (bSize + margin) * 3);

        // Option buttons — row above sticks, in the black bar
        const optY = controlTop + 8; // just below game viewport edge
        const optSize = 40;
        this._posBtn(this.buttons.eyesBleed, leftStickX - optSize / 2 - 4, optY);
        this._posBtn(this.buttons.mute, leftStickX + optSize / 2 + 4, optY);
        this._posBtn(this.buttons.pause, rightStickX - 22, optY);
    }

    _posBtn(el, x, y) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }
}
