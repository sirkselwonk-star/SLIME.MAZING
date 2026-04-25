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
    }

    spawnOre(grid, rows, cols, corridorSize, offsetX, offsetZ, THREE) {
        const oreGroup = new THREE.Group();
        const oreMaterial = new THREE.MeshStandardMaterial({
            color: 0xfb923c,
            emissive: 0xfb923c,
            emissiveIntensity: 0.6,
            roughness: 0.3,
            metalness: 0.9
        });

        this.oreNodes = [];
        this.oreCollected = 0;

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

                    const oreGeo = new THREE.OctahedronGeometry(0.25, 0);
                    const oreMesh = new THREE.Mesh(oreGeo, oreMaterial.clone());
                    oreMesh.position.set(x, 1.0, z);
                    oreMesh.userData = { row: r, col: c, collected: false };
                    oreGroup.add(oreMesh);

                    this.oreNodes.push(oreMesh);
                }
            }
        }

        this.oreTotal = this.oreNodes.length;
        return oreGroup;
    }

    update(playerPos, exitPos, dt) {
        if (this.state !== 'PLAYING') return;

        const collectRadius = 1.2;
        const exitRadius = 1.5;

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

    updateVisited(playerGridRow, playerGridCol) {
        // Reveal cells around player (3x3)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                this.visitedCells.add(`${playerGridRow + dr},${playerGridCol + dc}`);
            }
        }
    }
}
