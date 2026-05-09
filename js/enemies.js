// enemies.js — Enemy spawning, patrol AI, contact damage

import { random } from './rng.js?v=1';

export class EnemyManager {
    constructor(scene, THREE) {
        this.scene = scene;
        this.THREE = THREE;
        this.enemies = [];
        this.detectionRange = 8;
        this.contactRadius = 1.0;
        this.contactCooldown = 0.5; // seconds between damage ticks

        // All enemies share one geometry + material. Cuts per-spawn allocation
        // and means cleanup() only has to dispose two GPU resources, not 2×N.
        this._sharedGeo = new THREE.IcosahedronGeometry(0.35, 1);
        this._sharedMat = new THREE.MeshStandardMaterial({
            color: 0xcc3366,
            emissive: 0xff2255,
            emissiveIntensity: 1.5,
            roughness: 0.4,
            metalness: 0.7
        });
    }

    spawnEnemies(grid, rows, cols, corridorSize, offsetX, offsetZ, startPos, exitPos) {
        const candidates = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!grid[r][c].inside) continue;
                // Not near start or exit (manhattan distance >= 4)
                if (Math.abs(r - startPos.row) + Math.abs(c - startPos.col) < 4) continue;
                if (Math.abs(r - exitPos.row) + Math.abs(c - exitPos.col) < 4) continue;
                candidates.push({ r, c });
            }
        }

        // Shuffle
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const count = Math.min(candidates.length, 8 + Math.floor(random() * 5));

        for (let i = 0; i < count; i++) {
            const { r, c } = candidates[i];
            const x = c * corridorSize + offsetX + corridorSize / 2;
            const z = r * corridorSize + offsetZ + corridorSize / 2;
            this._spawn(x, z, r, c, grid);
        }
    }

    _spawn(x, z, gridRow, gridCol, grid) {
        // No per-enemy PointLight: removing/adding lights at death time
        // forces three.js to recompile every lit material in the scene
        // (shader's light-array size changes). Emissive carries the look.
        const mesh = new this.THREE.Mesh(this._sharedGeo, this._sharedMat);
        mesh.position.set(x, 1.2, z);
        this.scene.add(mesh);

        // Pick initial movement direction from open walls
        const cell = grid[gridRow][gridCol];
        const dirs = [];
        if (!cell.walls.N) dirs.push({ dx: 0, dz: -1 });
        if (!cell.walls.S) dirs.push({ dx: 0, dz: 1 });
        if (!cell.walls.E) dirs.push({ dx: 1, dz: 0 });
        if (!cell.walls.W) dirs.push({ dx: -1, dz: 0 });
        const dir = dirs.length > 0
            ? dirs[Math.floor(random() * dirs.length)]
            : { dx: 0, dz: 0 };

        this.enemies.push({
            mesh,
            hp: 3,
            alive: true,
            dying: false,
            deathTimer: 0,
            speed: 3,
            moveDir: dir,
            gridRow,
            gridCol,
            damageCooldown: 0,
            bobPhase: random() * Math.PI * 2
        });
    }

    update(dt, playerPos, colliders, grid, corridorSize, offsetX, offsetZ) {
        let playerDamage = 0;

        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;

            // Death animation
            if (enemy.dying) {
                enemy.deathTimer += dt;
                const t = Math.min(enemy.deathTimer / 0.5, 1);
                enemy.mesh.scale.setScalar(1 - t);
                enemy.mesh.material.opacity = 1 - t;
                if (t >= 1) {
                    enemy.alive = false;
                    enemy.mesh.visible = false;
                }
                continue;
            }

            // Trigger death
            if (enemy.hp <= 0) {
                enemy.dying = true;
                enemy.deathTimer = 0;
                // Living enemies share one material to keep allocations cheap.
                // The fade animation mutates opacity per-frame, so this enemy
                // needs its own copy now or the fade would affect all peers.
                enemy.mesh.material = this._sharedMat.clone();
                enemy.mesh.material.transparent = true;
                enemy._materialOwned = true;
                continue;
            }

            if (enemy.damageCooldown > 0) enemy.damageCooldown -= dt;

            // Bob + spin
            enemy.bobPhase += dt * 3;
            enemy.mesh.position.y = 1.2 + Math.sin(enemy.bobPhase) * 0.15;
            enemy.mesh.rotation.y += dt * 1.5;

            // Face/chase player if in detection range
            if (playerPos) {
                const dx = playerPos.x - enemy.mesh.position.x;
                const dz = playerPos.z - enemy.mesh.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < this.detectionRange && dist > 0) {
                    enemy.moveDir.dx = dx / dist;
                    enemy.moveDir.dz = dz / dist;
                }

                // Contact damage
                if (dist < this.contactRadius && enemy.damageCooldown <= 0) {
                    playerDamage += 10;
                    enemy.damageCooldown = this.contactCooldown;
                }
            }

            // Move
            const newX = enemy.mesh.position.x + enemy.moveDir.dx * enemy.speed * dt;
            const newZ = enemy.mesh.position.z + enemy.moveDir.dz * enemy.speed * dt;

            // Wall collision
            let hitWall = false;
            if (colliders) {
                const r = 0.35;
                for (const box of colliders) {
                    if (newX + r > box.minX && newX - r < box.maxX &&
                        enemy.mesh.position.y + r > box.minY &&
                        enemy.mesh.position.y - r < box.maxY &&
                        newZ + r > box.minZ && newZ - r < box.maxZ) {
                        hitWall = true;
                        break;
                    }
                }
            }

            if (hitWall) {
                // Pick new random direction
                const gc = Math.floor((enemy.mesh.position.x - offsetX) / corridorSize);
                const gr = Math.floor((enemy.mesh.position.z - offsetZ) / corridorSize);
                if (grid[gr] && grid[gr][gc]) {
                    const cell = grid[gr][gc];
                    const dirs = [];
                    if (!cell.walls.N) dirs.push({ dx: 0, dz: -1 });
                    if (!cell.walls.S) dirs.push({ dx: 0, dz: 1 });
                    if (!cell.walls.E) dirs.push({ dx: 1, dz: 0 });
                    if (!cell.walls.W) dirs.push({ dx: -1, dz: 0 });

                    // Prefer directions other than where we came from
                    const opp = { dx: -enemy.moveDir.dx, dz: -enemy.moveDir.dz };
                    const filtered = dirs.filter(d => !(d.dx === opp.dx && d.dz === opp.dz));
                    const pool = filtered.length > 0 ? filtered : dirs;
                    enemy.moveDir = pool.length > 0
                        ? pool[Math.floor(random() * pool.length)]
                        : { dx: 0, dz: 0 };
                }
            } else {
                enemy.mesh.position.x = newX;
                enemy.mesh.position.z = newZ;
            }

            // Update grid position
            enemy.gridCol = Math.floor((enemy.mesh.position.x - offsetX) / corridorSize);
            enemy.gridRow = Math.floor((enemy.mesh.position.z - offsetZ) / corridorSize);
        }

        return playerDamage;
    }

    getEnemyPositions() {
        return this.enemies
            .filter(e => e.alive && !e.dying)
            .map(e => ({ row: e.gridRow, col: e.gridCol }));
    }

    cleanup() {
        for (const enemy of this.enemies) {
            this.scene.remove(enemy.mesh);
            // Dying enemies have their own cloned material — release it.
            if (enemy._materialOwned) enemy.mesh.material.dispose();
        }
        this.enemies = [];
        this._sharedGeo.dispose();
        this._sharedMat.dispose();
    }
}
