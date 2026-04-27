// touch-controls.js — Mobile touch overlay: joystick, look, action buttons

export class TouchControlsManager {
    constructor(controls) {
        this.controls = controls;
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.enabled = false;

        // Joystick state
        this.joystickTouchId = null;
        this.joystickOrigin = { x: 0, y: 0 };
        this.joystickPos = { x: 0, y: 0 };
        this.joystickRadius = 60;
        this.joystickDeadzone = 0.15;

        // Look state
        this.lookTouchId = null;
        this.lookLast = { x: 0, y: 0 };
        this.lookSensitivity = 0.4;

        // Layout
        this.isLandscape = true;
        this.overlay = null;
        this.joystickBase = null;
        this.joystickKnob = null;
        this.joystickZone = null;
        this.lookZone = null;
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

    _createOverlay() {
        const o = document.createElement('div');
        o.id = 'touch-overlay';
        o.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 40; pointer-events: none; display: none;
            user-select: none; -webkit-user-select: none;
        `;

        // Joystick zone (left side)
        this.joystickZone = document.createElement('div');
        this.joystickZone.style.cssText = `
            position: absolute; left: 0; top: 0; width: 35%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;

        // Joystick base (hidden until touch)
        this.joystickBase = document.createElement('div');
        this.joystickBase.style.cssText = `
            position: absolute; width: 120px; height: 120px;
            border: 2px solid rgba(74, 222, 128, 0.4);
            border-radius: 50%; display: none;
            transform: translate(-50%, -50%);
            background: rgba(74, 222, 128, 0.06);
        `;

        // Joystick knob
        this.joystickKnob = document.createElement('div');
        this.joystickKnob.style.cssText = `
            position: absolute; width: 56px; height: 56px;
            background: rgba(74, 222, 128, 0.35);
            border: 2px solid rgba(74, 222, 128, 0.6);
            border-radius: 50%;
            left: 50%; top: 50%;
            transform: translate(-50%, -50%);
        `;

        this.joystickBase.appendChild(this.joystickKnob);
        this.joystickZone.appendChild(this.joystickBase);
        o.appendChild(this.joystickZone);

        // Look zone (right side)
        this.lookZone = document.createElement('div');
        this.lookZone.style.cssText = `
            position: absolute; right: 0; top: 0; width: 65%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;
        o.appendChild(this.lookZone);

        // Action buttons
        this._createButtons(o);

        document.body.appendChild(o);
        this.overlay = o;
        this.updateLayout();
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
        // Fire Gun (green)
        this.buttons.gun = this._createButton('GUN', '#4ade80');
        // Fire Rocket (orange)
        this.buttons.rocket = this._createButton('RKT', '#fb923c');
        // Up (cyan)
        this.buttons.up = this._createButton('UP', '#22d3ee');
        // Down (cyan)
        this.buttons.down = this._createButton('DWN', '#22d3ee');
        // Eyes Bleed (magenta)
        this.buttons.eyesBleed = this._createButton('EYE', '#f472b6');
        // Mute (gray)
        this.buttons.mute = this._createButton('MUT', '#888');
        // Pause (gray, top-right)
        this.buttons.pause = this._createButton('| |', '#888', 44);

        for (const btn of Object.values(this.buttons)) {
            overlay.appendChild(btn);
        }
    }

    _bindTouchEvents() {
        // Joystick zone
        this.joystickZone.addEventListener('touchstart', e => this._onJoystickStart(e), { passive: false });
        this.joystickZone.addEventListener('touchmove', e => this._onJoystickMove(e), { passive: false });
        this.joystickZone.addEventListener('touchend', e => this._onJoystickEnd(e), { passive: false });
        this.joystickZone.addEventListener('touchcancel', e => this._onJoystickEnd(e), { passive: false });

        // Look zone
        this.lookZone.addEventListener('touchstart', e => this._onLookStart(e), { passive: false });
        this.lookZone.addEventListener('touchmove', e => this._onLookMove(e), { passive: false });
        this.lookZone.addEventListener('touchend', e => this._onLookEnd(e), { passive: false });
        this.lookZone.addEventListener('touchcancel', e => this._onLookEnd(e), { passive: false });

        // Button events
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

            if (action === 'gun') {
                this.controls.gunHeld = false;
            } else if (action === 'up') {
                this.controls.keys['Space'] = false;
            } else if (action === 'down') {
                this.controls.keys['ShiftLeft'] = false;
            }
        }, { passive: false });

        el.addEventListener('touchcancel', e => {
            el.style.opacity = '0.7';
            el.style.background = 'rgba(0,0,0,0.35)';
            if (action === 'gun') this.controls.gunHeld = false;
            if (action === 'up') this.controls.keys['Space'] = false;
            if (action === 'down') this.controls.keys['ShiftLeft'] = false;
        }, { passive: false });
    }

    // --- Joystick handlers ---

    _onJoystickStart(e) {
        e.preventDefault();
        if (this.joystickTouchId !== null) return;

        const t = e.changedTouches[0];
        this.joystickTouchId = t.identifier;
        this.joystickOrigin.x = t.clientX;
        this.joystickOrigin.y = t.clientY;
        this.joystickPos.x = 0;
        this.joystickPos.y = 0;

        // Show base at touch point
        this.joystickBase.style.display = 'block';
        this.joystickBase.style.left = t.clientX + 'px';
        this.joystickBase.style.top = t.clientY + 'px';
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    }

    _onJoystickMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== this.joystickTouchId) continue;

            let dx = t.clientX - this.joystickOrigin.x;
            let dy = t.clientY - this.joystickOrigin.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Clamp to radius
            if (dist > this.joystickRadius) {
                dx = (dx / dist) * this.joystickRadius;
                dy = (dy / dist) * this.joystickRadius;
            }

            // Normalized -1..+1
            this.joystickPos.x = dx / this.joystickRadius;
            this.joystickPos.y = dy / this.joystickRadius;

            // Move knob visually
            this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
    }

    _onJoystickEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== this.joystickTouchId) continue;
            this.joystickTouchId = null;
            this.joystickPos.x = 0;
            this.joystickPos.y = 0;
            this.joystickBase.style.display = 'none';
            this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
    }

    // --- Look handlers ---

    _onLookStart(e) {
        e.preventDefault();
        if (this.lookTouchId !== null) return;

        const t = e.changedTouches[0];
        this.lookTouchId = t.identifier;
        this.lookLast.x = t.clientX;
        this.lookLast.y = t.clientY;
    }

    _onLookMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== this.lookTouchId) continue;

            const dx = t.clientX - this.lookLast.x;
            const dy = t.clientY - this.lookLast.y;
            this.lookLast.x = t.clientX;
            this.lookLast.y = t.clientY;

            // Feed into existing mouse smoothing pipeline
            this.controls.mouseDX += dx * this.lookSensitivity;
            this.controls.mouseDY += dy * this.lookSensitivity;
        }
    }

    _onLookEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== this.lookTouchId) continue;
            this.lookTouchId = null;
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

        // Apply joystick to touchThrust (with deadzone)
        let jx = this.joystickPos.x;
        let jy = this.joystickPos.y;
        const mag = Math.sqrt(jx * jx + jy * jy);

        if (mag < this.joystickDeadzone) {
            this.controls.touchThrust.x = 0;
            this.controls.touchThrust.y = 0;
        } else {
            // Remap from deadzone..1 to 0..1 for smooth ramp
            const remapped = (mag - this.joystickDeadzone) / (1 - this.joystickDeadzone);
            const scale = remapped / mag;
            this.controls.touchThrust.x = jx * scale;
            this.controls.touchThrust.y = jy * scale;
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
        // Joystick zone: left 35%
        this.joystickZone.style.cssText = `
            position: absolute; left: 0; top: 0; width: 35%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;

        // Look zone: right 65%
        this.lookZone.style.cssText = `
            position: absolute; right: 0; top: 0; width: 65%; height: 100%;
            pointer-events: auto; touch-action: none;
        `;

        // Buttons — bottom-right cluster
        const margin = 16;
        const bSize = 56;
        const rightBase = w - margin - bSize;
        const bottomBase = h - margin - bSize;

        // Gun — bottom right
        this._posBtn(this.buttons.gun, rightBase, bottomBase);
        // Rocket — above gun
        this._posBtn(this.buttons.rocket, rightBase, bottomBase - bSize - margin);
        // Up — left of gun
        this._posBtn(this.buttons.up, rightBase - bSize - margin, bottomBase - bSize - margin);
        // Down — left of gun, lower
        this._posBtn(this.buttons.down, rightBase - bSize - margin, bottomBase);
        // Eyes Bleed — further left
        this._posBtn(this.buttons.eyesBleed, rightBase - (bSize + margin) * 2, bottomBase);
        // Mute — further left, above
        this._posBtn(this.buttons.mute, rightBase - (bSize + margin) * 2, bottomBase - bSize - margin);
        // Pause — top right
        this._posBtn(this.buttons.pause, w - margin - 44, margin);
    }

    _layoutPortrait(w, h) {
        // In portrait, the 16:9 game viewport sits in the upper portion.
        // The bottom black bar area is used for controls.
        const gameH = Math.floor(w / (16 / 9));
        const barH = h - gameH;
        const controlTop = gameH;

        // Joystick zone: left half of bottom bar
        this.joystickZone.style.cssText = `
            position: absolute; left: 0; top: ${controlTop}px;
            width: 50%; height: ${barH}px;
            pointer-events: auto; touch-action: none;
        `;

        // Look zone: covers the game viewport area (upper portion)
        this.lookZone.style.cssText = `
            position: absolute; left: 0; top: 0;
            width: 100%; height: ${gameH}px;
            pointer-events: auto; touch-action: none;
        `;

        // Buttons — right half of bottom bar
        const margin = 12;
        const bSize = 56;
        const rightBase = w - margin - bSize;
        const bottomBase = h - margin - bSize;

        this._posBtn(this.buttons.gun, rightBase, bottomBase);
        this._posBtn(this.buttons.rocket, rightBase, bottomBase - bSize - margin);
        this._posBtn(this.buttons.up, rightBase - bSize - margin, bottomBase - bSize - margin);
        this._posBtn(this.buttons.down, rightBase - bSize - margin, bottomBase);
        this._posBtn(this.buttons.eyesBleed, rightBase - (bSize + margin) * 2, bottomBase);
        this._posBtn(this.buttons.mute, rightBase - (bSize + margin) * 2, bottomBase - bSize - margin);
        // Pause — top right
        this._posBtn(this.buttons.pause, w - margin - 44, margin);
    }

    _posBtn(el, x, y) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }
}
