// controls.js — 6DOF ship controls with momentum
import * as THREE from 'three';

export class ShipControls {
    constructor(camera) {
        this.camera = camera;

        // Movement state
        this.velocity = { x: 0, y: 0, z: 0 };
        this.rotVelocity = { pitch: 0, yaw: 0, roll: 0 };

        // Tuning — comfort-focused
        this.thrustPower = 12;
        this.brakeFactor = 0.85;   // stronger damping = less drift
        this.rotSpeed = 1.0;       // slower roll
        this.rotDamping = 0.88;
        this.maxSpeed = 10;        // reduced from 15
        this.mouseSensitivity = 0.0015;

        // Mouse smoothing state
        this.keys = {};
        this.mouseDX = 0;
        this.mouseDY = 0;
        this.smoothDX = 0;         // smoothed mouse output
        this.smoothDY = 0;
        this.mouseSmoothing = 0.65; // lerp factor (0=sluggish, 1=raw)
        this.maxMouseDelta = 30;   // clamp per-frame pixel delta
        this.pointerLocked = false;
        this._ignoreNextMouse = false; // skip first delta after lock

        this._bindEvents();
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
            if (this.pointerLocked) {
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
    }

    lockPointer(element) {
        element.requestPointerLock();
    }

    update(dt, colliders) {
        if (!this.pointerLocked) return;

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

        const yawDelta = -this.smoothDX * this.mouseSensitivity;
        const pitchDelta = -this.smoothDY * this.mouseSensitivity;

        // Apply yaw (around world Y)
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), yawDelta
        );
        cam.quaternion.premultiply(yawQuat);

        // Apply pitch (around local X)
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), pitchDelta
        );
        cam.quaternion.multiply(pitchQuat);

        // Roll from Q/E
        let rollInput = 0;
        if (this.keys['KeyQ']) rollInput += 1;
        if (this.keys['KeyE']) rollInput -= 1;
        if (rollInput !== 0) {
            const rollQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1), rollInput * this.rotSpeed * dt
            );
            cam.quaternion.multiply(rollQuat);
        }

        // --- Translation ---
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        let thrust = new THREE.Vector3(0, 0, 0);

        if (this.keys['KeyW']) thrust.add(forward.clone().multiplyScalar(this.thrustPower * dt));
        if (this.keys['KeyS']) thrust.add(forward.clone().multiplyScalar(-this.thrustPower * dt));
        if (this.keys['KeyA']) thrust.add(right.clone().multiplyScalar(-this.thrustPower * dt));
        if (this.keys['KeyD']) thrust.add(right.clone().multiplyScalar(this.thrustPower * dt));
        if (this.keys['Space']) thrust.add(up.clone().multiplyScalar(this.thrustPower * dt * 0.5));
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) thrust.add(up.clone().multiplyScalar(-this.thrustPower * dt * 0.5));

        this.velocity.x += thrust.x;
        this.velocity.y += thrust.y;
        this.velocity.z += thrust.z;

        // Damping — frame-rate independent (normalized to 60fps)
        const damping = Math.pow(this.brakeFactor, dt * 60);
        this.velocity.x *= damping;
        this.velocity.y *= damping;
        this.velocity.z *= damping;

        // Clamp speed
        const speed = Math.sqrt(
            this.velocity.x ** 2 + this.velocity.y ** 2 + this.velocity.z ** 2
        );
        if (speed > this.maxSpeed) {
            const scale = this.maxSpeed / speed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
            this.velocity.z *= scale;
        }

        // Proposed new position
        let newX = cam.position.x + this.velocity.x * dt;
        let newY = cam.position.y + this.velocity.y * dt;
        let newZ = cam.position.z + this.velocity.z * dt;

        // Clamp Y to corridor height
        const shipRadius = 0.4;
        newY = Math.max(shipRadius, Math.min(2.6, newY));

        // Collision detection against wall AABBs
        if (colliders) {
            const r = shipRadius;
            for (const box of colliders) {
                // Check AABB overlap with ship sphere approximated as AABB
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
