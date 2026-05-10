// controls.js — first-person walkthrough controls (WASD + mouse + jump)
import * as THREE from 'three';

export class ShipControls {
    constructor(camera) {
        this.camera = camera;

        // Horizontal velocity only — vertical lives in this.verticalVelocity
        this.velocity = { x: 0, y: 0, z: 0 };

        // Tuning
        this.thrustPower = 36;
        this.brakeFactor = 0.93;   // horizontal drift/coast
        this.maxSpeed = 30;
        this.mouseSensitivity = 0.003;
        // Direct velocity used for the touch path — no thrust ramp, no
        // damping, no inertia. Snaps to value on stick deflection, drops
        // to 0 on release. Doom-style constant-speed walking.
        this.touchMoveSpeed = 10;

        // FPS body — eye-height floor, ceiling clamp, gravity, jump
        this.eyeHeight = 1.5;     // matches mazeData.startWorld.y so spawn doesn't snap
        this.ceilingY = 2.55;
        this.gravity = 30;
        this.jumpStrength = 7;
        this.verticalVelocity = 0;
        this.isGrounded = true;

        // Look state — tracked as Eulers so pitch can be clamped (no somersaults)
        this.yaw = 0;
        this.pitch = 0;
        this.maxPitch = Math.PI / 2 - 0.05;
        // Tighter pitch envelope on touch devices — keeps the camera horizon
        // anchored so thumb-flicks can't tip the view past comfortable.
        this.maxPitchTouch = Math.PI / 4;

        // Mouse smoothing state
        this.keys = {};
        this.mouseDX = 0;
        this.mouseDY = 0;
        this.smoothDX = 0;         // smoothed mouse output
        this.smoothDY = 0;
        this.mouseSmoothing = 0.65; // lerp factor (0=sluggish, 1=raw)
        this.maxMouseDelta = 150;  // clamp per-frame pixel delta
        this.pointerLocked = false;
        this._ignoreNextMouse = false; // skip first delta after lock

        // Playwright/automation mode — set with ?pw=1 in the URL. Pointer
        // lock isn't reliably grantable through automated browser drivers,
        // so this flag treats mousemove deltas, mousedown firing, and the
        // update() gate as if the pointer were locked. Lets us drive a real
        // input walkthrough for memory + perf testing.
        this._pwMode = (typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('pw') === '1');

        // Firing state — consumed by game loop each frame
        this.firing = { gun: false, rocket: false };
        this.gunHeld = false; // true while left mouse held

        // Touch control state (set by TouchControlsManager)
        this.touchActive = false;
        this.touchThrust = { x: 0, y: 0 };

        this._bindEvents();

        // Capture starting yaw/pitch from camera's current orientation
        const e0 = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = e0.y;
        this.pitch = e0.x;
    }

    _bindEvents() {
        document.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                e.preventDefault();
            }
            if (e.code === 'Escape') {
                document.exitPointerLock();
            }
        });
        document.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });

        document.addEventListener('mousemove', e => {
            if (this.pointerLocked || this._pwMode) {
                // Skip the first mouse event after lock — browsers often fire a huge spike
                if (this._ignoreNextMouse) {
                    this._ignoreNextMouse = false;
                    return;
                }
                this.mouseDX += e.movementX;
                this.mouseDY += e.movementY;
            }
        });

        document.addEventListener('pointerlockchange', () => {
            const wasLocked = this.pointerLocked;
            this.pointerLocked = !!document.pointerLockElement;
            // When pointer lock is newly acquired, ignore the first delta
            if (this.pointerLocked && !wasLocked) {
                this._ignoreNextMouse = true;
                this.mouseDX = 0;
                this.mouseDY = 0;
                this.smoothDX = 0;
                this.smoothDY = 0;
            }
        });

        // Mouse buttons — firing
        document.addEventListener('mousedown', e => {
            if (!this.pointerLocked && !this._pwMode) return;
            if (e.button === 0) { this.firing.gun = true; this.gunHeld = true; }
            if (e.button === 2) this.firing.rocket = true;
        });
        document.addEventListener('mouseup', e => {
            if (e.button === 0) this.gunHeld = false;
        });
        // Block right-click context menu
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    lockPointer(element) {
        element.requestPointerLock();
    }

    update(dt, colliders) {
        if (!this.pointerLocked && !this.touchActive && !this._pwMode) return;

        const cam = this.camera;

        // --- Rotation from mouse (smoothed + clamped) ---
        // Scale clamp with frame time so continuous spinning isn't throttled at low fps
        const maxDelta = this.maxMouseDelta * dt * 60;
        const clampedDX = Math.max(-maxDelta, Math.min(maxDelta, this.mouseDX));
        const clampedDY = Math.max(-maxDelta, Math.min(maxDelta, this.mouseDY));
        this.mouseDX = 0;
        this.mouseDY = 0;

        // Lerp toward clamped target (dt-corrected, high responsiveness)
        const mouseLerp = 1 - Math.pow(1 - this.mouseSmoothing, dt * 60);
        this.smoothDX += (clampedDX - this.smoothDX) * mouseLerp;
        this.smoothDY += (clampedDY - this.smoothDY) * mouseLerp;

        this.yaw += -this.smoothDX * this.mouseSensitivity;
        this.pitch += -this.smoothDY * this.mouseSensitivity;
        const pitchCap = this.touchActive ? this.maxPitchTouch : this.maxPitch;
        this.pitch = Math.max(-pitchCap, Math.min(pitchCap, this.pitch));
        cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

        // --- Translation (horizontal — forward/right derived from yaw alone) ---
        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

        if (this.touchActive) {
            // Direct velocity — no acceleration, no damping. Stick deflection
            // maps linearly to walking speed; release the stick and you stop.
            const tx = this.touchThrust.x;
            const ty = this.touchThrust.y;
            this.velocity.x = (right.x * tx + forward.x * -ty) * this.touchMoveSpeed;
            this.velocity.z = (right.z * tx + forward.z * -ty) * this.touchMoveSpeed;
        } else {
            // Keyboard path — thrust accumulates, damped, capped.
            const thrust = new THREE.Vector3(0, 0, 0);
            if (this.keys['KeyW']) thrust.add(forward.clone().multiplyScalar(this.thrustPower * dt));
            if (this.keys['KeyS']) thrust.add(forward.clone().multiplyScalar(-this.thrustPower * dt));
            if (this.keys['KeyA']) thrust.add(right.clone().multiplyScalar(-this.thrustPower * dt));
            if (this.keys['KeyD']) thrust.add(right.clone().multiplyScalar(this.thrustPower * dt));

            this.velocity.x += thrust.x;
            this.velocity.z += thrust.z;

            const damping = Math.pow(this.brakeFactor, dt * 60);
            this.velocity.x *= damping;
            this.velocity.z *= damping;

            const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
            if (hSpeed > this.maxSpeed) {
                const scale = this.maxSpeed / hSpeed;
                this.velocity.x *= scale;
                this.velocity.z *= scale;
            }
        }

        // --- Vertical (jump + gravity) ---
        if (this.keys['Space'] && this.isGrounded) {
            this.verticalVelocity = this.jumpStrength;
            this.isGrounded = false;
        }
        this.verticalVelocity -= this.gravity * dt;
        let newY = cam.position.y + this.verticalVelocity * dt;

        if (newY <= this.eyeHeight) {
            newY = this.eyeHeight;
            this.verticalVelocity = 0;
            this.isGrounded = true;
        }
        if (newY >= this.ceilingY) {
            newY = this.ceilingY;
            if (this.verticalVelocity > 0) this.verticalVelocity = 0;
        }

        // --- Horizontal proposed position ---
        let newX = cam.position.x + this.velocity.x * dt;
        let newZ = cam.position.z + this.velocity.z * dt;

        // Collision detection against wall AABBs (resolve in X/Z only — Y handled above)
        const shipRadius = 0.4;
        if (colliders) {
            const r = shipRadius;
            for (const box of colliders) {
                const overlapX = newX + r > box.minX && newX - r < box.maxX;
                const overlapY = newY + r > box.minY && newY - r < box.maxY;
                const overlapZ = newZ + r > box.minZ && newZ - r < box.maxZ;

                if (overlapX && overlapY && overlapZ) {
                    // Find smallest penetration axis and push out
                    const penX1 = (newX + r) - box.minX;
                    const penX2 = box.maxX - (newX - r);
                    const penZ1 = (newZ + r) - box.minZ;
                    const penZ2 = box.maxZ - (newZ - r);

                    const minPenX = Math.min(penX1, penX2);
                    const minPenZ = Math.min(penZ1, penZ2);

                    if (minPenX < minPenZ) {
                        if (penX1 < penX2) {
                            newX = box.minX - r;
                        } else {
                            newX = box.maxX + r;
                        }
                        this.velocity.x *= -0.2; // bounce
                    } else {
                        if (penZ1 < penZ2) {
                            newZ = box.minZ - r;
                        } else {
                            newZ = box.maxZ + r;
                        }
                        this.velocity.z *= -0.2;
                    }
                }
            }
        }

        cam.position.set(newX, newY, newZ);
    }

    getSpeed() {
        return Math.sqrt(
            this.velocity.x ** 2 + this.velocity.y ** 2 + this.velocity.z ** 2
        );
    }
}
