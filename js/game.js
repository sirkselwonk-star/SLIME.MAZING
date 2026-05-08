// game.js — Ore spawning, collection, exit detection

export class GameState {
    constructor() {
        this.state = 'MENU'; // MENU, PLAYING, LEVEL_COMPLETE
        this.oreCollected = 0;
        this.oreTotal = 0;
        this.oreNodes = [];       // { mesh, collected, row, col }
        this.visitedCells = new Set();
        this.oreRequiredPct = 0.5; // need 50% ore to unlock exit
        this.exitUnlocked = false;

        // SLIME painting tracking
        this.slimesAdmired = 0;
        this.slimesTotal = 0;
        this.admiredPaintings = new Set();

        // Combat state
        this.playerHP = 100;
        this.playerMaxHP = 100;
        this.gunAmmo = 200;
        this.rocketAmmo = 10;
        this.enemiesKilled = 0;
        this.damageFlash = 0; // 0-1, fades out

        // Wired by main.js — fires once per ore pickup
        this.onOreCollected = null;
    }

    spawnOre(grid, rows, cols, corridorSize, offsetX, offsetZ, THREE) {
        const oreGroup = new THREE.Group();

        // Diamond appearance: pale blue-white, very shiny, glowing softly.
        // Geometry stretched on Y for a brilliant-cut silhouette. Geo and
        // material are shared across all ore meshes — was being recreated
        // per ore, leaking ~150 unique materials/geometries per level.
        const oreGeo = new THREE.OctahedronGeometry(0.22, 0);
        oreGeo.scale(1, 1.6, 1);
        const oreMaterial = new THREE.MeshStandardMaterial({
            color: 0xddeeff,
            emissive: 0x88ccff,
            emissiveIntensity: 0.55,
            roughness: 0.05,
            metalness: 0.9
        });

        this.oreNodes = [];
        this.oreCollected = 0;
        this._THREE = THREE;

        // Place ore at dead ends and random corridor cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = grid[r][c];
                if (!cell.inside) continue;

                // Count open walls (passages)
                const openWalls = Object.values(cell.walls).filter(w => !w).length;

                let placeOre = false;
                if (openWalls === 1) {
                    // Dead end — always place ore
                    placeOre = true;
                } else if (Math.random() < 0.15) {
                    // Random chance in corridors
                    placeOre = true;
                }

                if (placeOre) {
                    const x = c * corridorSize + offsetX + corridorSize / 2;
                    const z = r * corridorSize + offsetZ + corridorSize / 2;

                    const oreMesh = new THREE.Mesh(oreGeo, oreMaterial);
                    oreMesh.position.set(x, 1.0, z);
                    oreMesh.userData = { row: r, col: c, collected: false };
                    oreGroup.add(oreMesh);

                    this.oreNodes.push(oreMesh);
                }
            }
        }

        this.oreTotal = this.oreNodes.length;

        // Magical sparkle field — single Points object covering all ore.
        // Sparkles orbit + twinkle via shader; one draw call for everything.
        this._buildOreSparkles(THREE, oreGroup);

        return oreGroup;
    }

    _buildOreSparkles(THREE, oreGroup) {
        const SPARKLES_PER_ORE = 3;
        this._sparklesPerOre = SPARKLES_PER_ORE;
        const total = this.oreNodes.length * SPARKLES_PER_ORE;
        if (total === 0) return;

        const positions = new Float32Array(total * 3);
        const offsets = new Float32Array(total * 3);
        const phases = new Float32Array(total);
        const actives = new Float32Array(total);

        let idx = 0;
        for (let i = 0; i < this.oreNodes.length; i++) {
            const ore = this.oreNodes[i];
            ore.userData.sparkleStart = idx;
            for (let s = 0; s < SPARKLES_PER_ORE; s++) {
                positions[idx * 3]     = ore.position.x;
                positions[idx * 3 + 1] = ore.position.y;
                positions[idx * 3 + 2] = ore.position.z;
                const a = Math.random() * Math.PI * 2;
                const r = 0.3 + Math.random() * 0.25;
                offsets[idx * 3]     = Math.cos(a) * r;
                offsets[idx * 3 + 1] = (Math.random() - 0.5) * 0.7;
                offsets[idx * 3 + 2] = Math.sin(a) * r;
                phases[idx] = Math.random();
                actives[idx] = 1;
                idx++;
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
        geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        const activeAttr = new THREE.BufferAttribute(actives, 1);
        activeAttr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aActive', activeAttr);

        this._sparkleActives = actives;
        this._sparkleAttribute = activeAttr;
        this._sparkleTime = { value: 0 };

        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this._sparkleTime },
            vertexShader: `
                attribute vec3 aOffset;
                attribute float aPhase;
                attribute float aActive;
                uniform float uTime;
                varying float vTwinkle;
                void main() {
                    float ph = aPhase * 6.2832;
                    float t = uTime * 1.5 + ph;
                    float c = cos(t * 0.5);
                    float s = sin(t * 0.5);
                    vec3 orb = vec3(
                        aOffset.x * c - aOffset.z * s,
                        aOffset.y + sin(t * 1.2) * 0.12,
                        aOffset.x * s + aOffset.z * c
                    );
                    vec3 wp = position + orb;
                    vec4 mv = modelViewMatrix * vec4(wp, 1.0);
                    vTwinkle = (0.5 + 0.5 * sin(t * 3.0)) * aActive;
                    gl_PointSize = (2.0 + 3.5 * vTwinkle) * aActive * (300.0 / -mv.z);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: `
                varying float vTwinkle;
                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float r = length(uv);
                    if (r > 0.5) discard;
                    float fade = smoothstep(0.5, 0.0, r);
                    // Subtle star streaks along cardinal axes
                    float streak = pow(max(1.0 - abs(uv.x) * 4.0, 0.0), 6.0)
                                 + pow(max(1.0 - abs(uv.y) * 4.0, 0.0), 6.0);
                    float a = fade * vTwinkle * (1.0 + streak * 0.25) * 0.5;
                    vec3 col = mix(vec3(0.55, 0.8, 1.0), vec3(0.9, 0.95, 1.0), vTwinkle);
                    gl_FragColor = vec4(col, a);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this._oreSparkles = new THREE.Points(geo, mat);
        this._oreSparkles.frustumCulled = false;
        oreGroup.add(this._oreSparkles);
    }

    update(playerPos, exitPos, dt) {
        if (this.state !== 'PLAYING') return;

        const collectRadius = 1.2;
        const exitRadius = 1.5;

        // Sparkle uniform — same time source the ore-bob uses below
        if (this._sparkleTime) this._sparkleTime.value = Date.now() * 0.001;

        // Animate uncollected ore (spin)
        for (const ore of this.oreNodes) {
            if (ore.userData.collected) continue;

            ore.rotation.y += dt * 2;
            ore.rotation.x += dt * 0.5;
            ore.position.y = 1.0 + Math.sin(Date.now() * 0.003 + ore.userData.col) * 0.15;

            // Check collection
            const dx = playerPos.x - ore.position.x;
            const dz = playerPos.z - ore.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < collectRadius) {
                ore.userData.collected = true;
                ore.visible = false;
                this.oreCollected++;

                // Hide the sparkles for this ore
                if (this._sparkleActives && this._sparkleAttribute) {
                    const start = ore.userData.sparkleStart;
                    for (let i = start; i < start + this._sparklesPerOre; i++) {
                        this._sparkleActives[i] = 0;
                    }
                    this._sparkleAttribute.needsUpdate = true;
                }

                if (this.onOreCollected) this.onOreCollected();
            }
        }

        // Check exit unlock
        const requiredOre = Math.ceil(this.oreTotal * this.oreRequiredPct);
        this.exitUnlocked = this.oreCollected >= requiredOre;

        // Check exit reached
        if (exitPos && this.exitUnlocked) {
            const dx = playerPos.x - exitPos.x;
            const dz = playerPos.z - exitPos.z;
            if (Math.sqrt(dx * dx + dz * dz) < exitRadius) {
                this.state = 'LEVEL_COMPLETE';
            }
        }
    }

    checkPaintingProximity(playerPos, paintings) {
        if (!paintings) return;
        for (let i = 0; i < paintings.length; i++) {
            if (this.admiredPaintings.has(i)) continue;
            const wp = paintings[i].worldPos;
            if (!wp) continue;
            const dx = playerPos.x - wp.x;
            const dz = playerPos.z - wp.z;
            if (dx * dx + dz * dz < 16) { // 4-unit radius squared
                this.admiredPaintings.add(i);
                this.slimesAdmired++;
            }
        }
    }

    updateVisited(playerGridRow, playerGridCol) {
        // Reveal cells around player (3x3)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                this.visitedCells.add(`${playerGridRow + dr},${playerGridCol + dc}`);
            }
        }
    }
}
