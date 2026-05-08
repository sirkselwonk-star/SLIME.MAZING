// weapons.js — Projectile system (gun + rockets)

export class WeaponSystem {
    constructor(scene, THREE) {
        this.scene = scene;
        this.THREE = THREE;

        this.projectiles = [];
        this.onExplosion = null; // callback when explosion occurs

        // Cooldown timers
        this.gunCooldown = 0;
        this.rocketCooldown = 0;

        // Shared geometries + materials
        this.gunGeo = new THREE.SphereGeometry(0.08, 6, 6);
        this.gunMat = new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            transparent: true,
            opacity: 0.9
        });

        this.rocketGeo = new THREE.SphereGeometry(0.2, 8, 8);
        this.rocketMat = new THREE.MeshBasicMaterial({
            color: 0xfb923c,
            transparent: true,
            opacity: 0.9
        });

        // Effects (sparks, explosions)
        this.effects = [];

        // Muzzle flash
        this.muzzleFlash = new THREE.PointLight(0x4ade80, 0, 8);
        this.scene.add(this.muzzleFlash);
        this.muzzleTimer = 0;

        // Pre-allocated explosion light pool. Adding/removing lights at
        // runtime forces three.js to recompile every lit material in the
        // scene; pooling keeps the count constant.
        this._explosionLights = [];
        for (let i = 0; i < 3; i++) {
            const light = new THREE.PointLight(0xff6600, 0, 10);
            this.scene.add(light);
            this._explosionLights.push(light);
        }
    }

    fire(type, camera) {
        const THREE = this.THREE;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const pos = camera.position.clone().add(forward.clone().multiplyScalar(0.5));

        let mesh, speed, lifetime, damage, isRocket = false, blastRadius = 0;

        if (type === 'gun') {
            mesh = new THREE.Mesh(this.gunGeo, this.gunMat.clone());
            speed = 40;
            lifetime = 2;
            damage = 1;

            this.muzzleFlash.color.setHex(0x4ade80);
            this.muzzleFlash.intensity = 3;
            this.muzzleTimer = 0.05;
        } else {
            mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat.clone());
            // No per-rocket PointLight; same recompile concern as enemy lights.
            speed = 20;
            lifetime = 3;
            damage = 5;
            isRocket = true;
            blastRadius = 2.5;

            this.muzzleFlash.color.setHex(0xfb923c);
            this.muzzleFlash.intensity = 5;
            this.muzzleTimer = 0.08;
        }

        mesh.position.copy(pos);
        this.scene.add(mesh);

        this.projectiles.push({
            mesh,
            velocity: forward.multiplyScalar(speed),
            lifetime,
            age: 0,
            damage,
            isRocket,
            blastRadius,
            alive: true
        });

        this.muzzleFlash.position.copy(camera.position);
    }

    update(dt, colliders, enemies, grid) {
        // Update cooldowns
        if (this.gunCooldown > 0) this.gunCooldown -= dt;
        if (this.rocketCooldown > 0) this.rocketCooldown -= dt;

        // Muzzle flash fade
        if (this.muzzleTimer > 0) {
            this.muzzleTimer -= dt;
            if (this.muzzleTimer <= 0) this.muzzleFlash.intensity = 0;
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            if (!proj.alive) continue;

            proj.age += dt;
            if (proj.age >= proj.lifetime) {
                this._killProjectile(i);
                continue;
            }

            // Move
            proj.mesh.position.addScaledVector(proj.velocity, dt);

            // Wall collision
            let hitWall = false;
            if (colliders) {
                const p = proj.mesh.position;
                const r = proj.isRocket ? 0.2 : 0.08;
                for (const box of colliders) {
                    if (p.x + r > box.minX && p.x - r < box.maxX &&
                        p.y + r > box.minY && p.y - r < box.maxY &&
                        p.z + r > box.minZ && p.z - r < box.maxZ) {
                        if (proj.isRocket && box.gridRef) {
                            this._spawnExplosion(p.clone());
                            this._destroyWallsInRadius(p, proj.blastRadius, colliders, grid);
                        } else {
                            this._spawnSpark(p.clone());
                        }
                        hitWall = true;
                        break;
                    }
                }
            }

            if (hitWall) {
                this._killProjectile(i);
                continue;
            }

            // Enemy collision
            if (enemies) {
                const p = proj.mesh.position;
                let hitEnemy = false;
                for (const enemy of enemies) {
                    if (!enemy.alive || enemy.dying) continue;
                    const dx = p.x - enemy.mesh.position.x;
                    const dy = p.y - enemy.mesh.position.y;
                    const dz = p.z - enemy.mesh.position.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < 0.8) {
                        enemy.hp -= proj.damage;
                        if (proj.isRocket) {
                            this._spawnExplosion(p.clone());
                        } else {
                            this._spawnSpark(p.clone());
                        }
                        hitEnemy = true;
                        break;
                    }
                }
                if (hitEnemy) {
                    this._killProjectile(i);
                    continue;
                }
            }
        }

        // Update effects (sparks/explosions fading)
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i];
            fx.age += dt;
            if (fx.age >= fx.lifetime) {
                this.scene.remove(fx.mesh);
                // Pooled light: zero intensity to free the slot, but keep
                // it in the scene so the light count stays constant.
                if (fx.light) fx.light.intensity = 0;
                this.effects.splice(i, 1);
                continue;
            }
            const t = fx.age / fx.lifetime;
            fx.mesh.material.opacity = 1 - t;
            fx.mesh.scale.setScalar(1 + t * 2);
            if (fx.light) fx.light.intensity = fx.startIntensity * (1 - t);
        }
    }

    _destroyWallsInRadius(pos, radius, colliders, grid) {
        const toDestroy = [];
        for (let i = colliders.length - 1; i >= 0; i--) {
            const box = colliders[i];
            if (!box.gridRef) continue;
            // Perimeter walls are indestructible — keeps the player inside
            // the maze (escaping lets all paintings render at once).
            if (box.isPerimeter) continue;
            const cx = (box.minX + box.maxX) / 2;
            const cz = (box.minZ + box.maxZ) / 2;
            const dx = pos.x - cx;
            const dz = pos.z - cz;
            if (Math.sqrt(dx * dx + dz * dz) < radius) {
                toDestroy.push(box);
            }
        }

        const opposites = { N: 'S', S: 'N', E: 'W', W: 'E' };
        const deltas = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };

        for (const box of toDestroy) {
            const { row, col, dir } = box.gridRef;

            // Update grid on both sides
            if (grid[row] && grid[row][col]) grid[row][col].walls[dir] = false;
            const [dr, dc] = deltas[dir];
            const nr = row + dr, nc = col + dc;
            if (grid[nr] && grid[nr][nc]) grid[nr][nc].walls[opposites[dir]] = false;

            // Hide mesh + remove collider
            if (box.mesh) box.mesh.visible = false;
            const idx = colliders.indexOf(box);
            if (idx !== -1) colliders.splice(idx, 1);

            // Remove the duplicate collider from the neighbor cell
            for (let j = colliders.length - 1; j >= 0; j--) {
                const c = colliders[j];
                if (c.gridRef && c.gridRef.row === nr && c.gridRef.col === nc &&
                    c.gridRef.dir === opposites[dir]) {
                    if (c.mesh) c.mesh.visible = false;
                    colliders.splice(j, 1);
                }
            }
        }
    }

    _killProjectile(index) {
        const proj = this.projectiles[index];
        this.scene.remove(proj.mesh);
        this.projectiles.splice(index, 1);
    }

    _spawnSpark(pos) {
        const THREE = this.THREE;
        const geo = new THREE.SphereGeometry(0.15, 6, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x4ade80, transparent: true, opacity: 1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        this.scene.add(mesh);
        this.effects.push({ mesh, age: 0, lifetime: 0.2, light: null, startIntensity: 0 });
    }

    _spawnExplosion(pos) {
        const THREE = this.THREE;
        const geo = new THREE.SphereGeometry(0.5, 12, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff6600, transparent: true, opacity: 1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        this.scene.add(mesh);

        // Take a pooled light slot if free; if all in use, mesh still flashes.
        let light = null;
        for (const slot of this._explosionLights) {
            if (slot.intensity <= 0) {
                slot.position.copy(pos);
                slot.intensity = 8;
                light = slot;
                break;
            }
        }

        this.effects.push({ mesh, age: 0, lifetime: 0.4, light, startIntensity: 8 });

        if (this.onExplosion) this.onExplosion();
    }

    canFire(type) {
        return type === 'gun' ? this.gunCooldown <= 0 : this.rocketCooldown <= 0;
    }

    startCooldown(type) {
        if (type === 'gun') this.gunCooldown = 0.15;
        else this.rocketCooldown = 0.8;
    }

    cleanup() {
        for (const proj of this.projectiles) this.scene.remove(proj.mesh);
        this.projectiles = [];
        for (const fx of this.effects) {
            this.scene.remove(fx.mesh);
            if (fx.light) fx.light.intensity = 0;
        }
        this.effects = [];
        if (this.muzzleFlash) this.scene.remove(this.muzzleFlash);
        for (const light of this._explosionLights || []) this.scene.remove(light);
        this._explosionLights = [];
    }
}
