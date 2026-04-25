// maze.js — SVG path → polygon → grid → maze generation

const SLIME_SVG_PATH = "M448.3-.2h3.1c24.8-.3 49 .4 73.6 4.2l3.5.6a398 398 0 0 1 205.7 98.9l6.7 5.8c45 39.2 65.5 98.7 70 156.7q.6 14.7.4 29.4v3.6q.2 26.9-2.2 53.5l-.3 2.5q-1.5 15.6-3.5 31l-.4 3.3q-4.1 33.8-9 67.2c-5.2 36.1-10.3 72.2-13.9 108.5l-.2 2.4q-1.6 15.7-2.8 31.6l-.2 2a773 773 0 0 0 .4 128.1q4.5 51 16.8 100.9l.8 3.3A630 630 0 0 0 873 1011l1.7 2.7a690 690 0 0 0 32.1 47.7q4.3 6 9.8 10.8a356 356 0 0 1 23.2 22.4l13.7 13.7 2.5 2.4a223 223 0 0 1 18.8 21.5c10.2 12 21 26 22.5 42.1-.5 5.7-2.6 9.9-6.5 14-17.2 10.4-42 6.4-60.6 2-37.7-9.4-76.4-29.7-99-62.4-22.7-38.4-31.5-89.3-43.4-132l-.8-2.9-12.4-45a284 284 0 0 0-7.7-24.7l-.7-2c-4.5-11.5-10.3-21.2-21.7-26.7a50 50 0 0 0-37.5 3.8 43 43 0 0 0-23 24.4c-15.7 55 11.7 127.3 23.6 181.4l21 95.1c7 31.6 14 63 22.5 94.2q3 11.5 5.6 23.2l.6 2.3c20.3 88.8 20.3 88.8 5.7 113a21 21 0 0 1-11.7 9.6c-16.4 3.1-32.2-5.2-45.4-14A205 205 0 0 1 680 1406l-2-2a230 230 0 0 1-24-26l-1.6-2a259 259 0 0 1-22.8-34.5 221 221 0 0 1-29.8-108.2v-2.2q0-13.5 1.2-26.8 1.4-13.2 1.3-26.5v-3.6c0-16.8-5.3-30.8-17-43l-2.3-2.2-1.8-1.9c-13.1-12.9-34-17.7-51.3-22.3A90 90 0 0 1 491 1086l-2-1.8c-14-12.7-19.7-30.8-21-49.2q-.3-10.7 1-21.2l.4-3q1.4-10.4 3.6-20.5l.5-2.6 2.8-12.8c3.6-16 3.6-16 1.7-32-2.8-4-5.3-5.7-10-6.9-21.6-2.5-43.2 9.3-59.6 22.3-31.9 26.9-50.2 65-54.3 106.2l-.7 7.4a452 452 0 0 0-2.6 46v2.4a710 710 0 0 0 15.8 136.7q7.6 39.6 16.5 79l.7 3 6.7 30c16.9 74.8 16.9 74.8 8 89.8A31 31 0 0 1 379 1471a89 89 0 0 1-36-4l-2-.6a82 82 0 0 1-27-14.4l-2.8-2.2A162 162 0 0 1 248 1338q-1.2-10.8-1.2-21.7v-3l-.1-15.7c-.2-26.2 4.8-51.4 9.6-77.1l5.4-29 .5-3a3670 3670 0 0 0 11.8-67.2c19.4-102.8 19.4-102.8-9-200.3-4.7-6-9.2-11.6-16.7-13.8-11.3-.7-20.7 5.4-28.9 12.6L212 927l-1.4 1.4c-30.4 31-40.2 67.1-45.5 109-5.1 39.9-15.3 73.8-43.7 103.2l-3.6 3.8c-21 22.3-57.5 44.3-88.8 46h-5.3l-2.5.1a25 25 0 0 1-18.1-7.1A21 21 0 0 1 .6 1167c5.7-20.7 20.2-39 31.8-56.7a852 852 0 0 0 50-86c39.2-78.2 54.3-166.4 28.7-522a1641 1641 0 0 1-8.3-67.2 722 722 0 0 1-3.4-48.6v-3.9Q98.6 370 99 357v-2.8c.9-38.1 3.4-78.4 14-115.2l.6-2a215 215 0 0 1 12.4-31l1.1-2.4a281 281 0 0 1 39.2-61.5q5.9-7.5 12.3-14.5l5.7-6.4q5.6-6.4 11.6-12.3l2-2A253 253 0 0 1 212 94l3-2.6C278.2 36.8 364 .4 448.3-.2";

const SVG_WIDTH = 997;
const SVG_HEIGHT = 1471;
const CELL_SIZE = 25; // grid cell size in SVG units

// --- SVG Path → Polygon Points ---

function svgPathToPolygon(pathD, sampleCount) {
    // Use an offscreen SVG + path element to sample points
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    document.body.appendChild(svg);

    const totalLen = path.getTotalLength();
    const samples = sampleCount || Math.ceil(totalLen / 2);
    const points = [];
    for (let i = 0; i < samples; i++) {
        const pt = path.getPointAtLength((i / samples) * totalLen);
        points.push({ x: pt.x, y: pt.y });
    }

    document.body.removeChild(svg);
    return points;
}

// --- Point-in-Polygon (ray casting) ---

function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// --- Build Grid from Polygon ---

function buildGrid(polygon) {
    const cols = Math.floor(SVG_WIDTH / CELL_SIZE);
    const rows = Math.floor(SVG_HEIGHT / CELL_SIZE);

    // grid[row][col] = { inside, walls: {N,S,E,W}, visited }
    const grid = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) {
            const cx = c * CELL_SIZE + CELL_SIZE / 2;
            const cy = r * CELL_SIZE + CELL_SIZE / 2;
            const inside = pointInPolygon(cx, cy, polygon);
            grid[r][c] = {
                inside,
                walls: { N: true, S: true, E: true, W: true },
                visited: false,
                row: r,
                col: c
            };
        }
    }
    return { grid, rows, cols };
}

// --- Recursive Backtracker Maze ---

function generateMaze(grid, rows, cols) {
    // Find all inside cells
    const insideCells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c].inside) insideCells.push({ r, c });
        }
    }

    if (insideCells.length === 0) return { start: null, exit: null };

    // Find start (bottommost inside cell) and exit (topmost inside cell)
    let startCell = insideCells[0];
    let exitCell = insideCells[0];
    for (const cell of insideCells) {
        if (cell.r > startCell.r || (cell.r === startCell.r && cell.c < startCell.c)) startCell = cell;
        if (cell.r < exitCell.r || (cell.r === exitCell.r && cell.c > exitCell.c)) exitCell = cell;
    }

    // Find the center column among bottom row cells for a centered start
    const bottomRow = insideCells.filter(c => c.r === startCell.r);
    bottomRow.sort((a, b) => a.c - b.c);
    startCell = bottomRow[Math.floor(bottomRow.length / 2)];

    const topRow = insideCells.filter(c => c.r === exitCell.r);
    topRow.sort((a, b) => a.c - b.c);
    exitCell = topRow[Math.floor(topRow.length / 2)];

    // Recursive backtracker
    const stack = [];
    const start = grid[startCell.r][startCell.c];
    start.visited = true;
    stack.push(start);

    const directions = [
        { dr: -1, dc: 0, wall: 'N', opposite: 'S' },
        { dr: 1, dc: 0, wall: 'S', opposite: 'N' },
        { dr: 0, dc: 1, wall: 'E', opposite: 'W' },
        { dr: 0, dc: -1, wall: 'W', opposite: 'E' }
    ];

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = [];

        for (const dir of directions) {
            const nr = current.row + dir.dr;
            const nc = current.col + dir.dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighbor = grid[nr][nc];
                if (neighbor.inside && !neighbor.visited) {
                    neighbors.push({ cell: neighbor, dir });
                }
            }
        }

        if (neighbors.length > 0) {
            const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
            // Remove walls between current and chosen
            current.walls[chosen.dir.wall] = false;
            chosen.cell.walls[chosen.dir.opposite] = false;
            chosen.cell.visited = true;
            stack.push(chosen.cell);
        } else {
            stack.pop();
        }
    }

    return {
        start: { row: startCell.r, col: startCell.c },
        exit: { row: exitCell.r, col: exitCell.c }
    };
}

// --- Build 3D Geometry ---

function buildMazeGeometry(grid, rows, cols, startPos, exitPos, THREE) {
    const wallHeight = 3;
    const wallThickness = 0.3;
    const corridorSize = CELL_SIZE / 10; // Scale SVG units to 3D units

    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x445577,
        emissive: 0x0a2010,
        emissiveIntensity: 1.2,
        shininess: 80,
        specular: 0x336699
    });

    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0x111118,
        emissive: 0x040408,
        emissiveIntensity: 0.4,
        shininess: 90,
        specular: 0x222244
    });

    const ceilingMaterial = new THREE.MeshPhongMaterial({
        color: 0x1a1a2a,
        emissive: 0x060610,
        emissiveIntensity: 0.6,
        shininess: 10
    });

    const mazeGroup = new THREE.Group();
    const lights = [];

    // Offset so maze is centered at origin
    const offsetX = -(cols * corridorSize) / 2;
    const offsetZ = -(rows * corridorSize) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.inside) continue;

            const x = c * corridorSize + offsetX;
            const z = r * corridorSize + offsetZ;

            // Floor
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(corridorSize, corridorSize),
                floorMaterial
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(x + corridorSize / 2, 0, z + corridorSize / 2);
            mazeGroup.add(floor);

            // Ceiling
            const ceiling = new THREE.Mesh(
                new THREE.PlaneGeometry(corridorSize, corridorSize),
                ceilingMaterial
            );
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set(x + corridorSize / 2, wallHeight, z + corridorSize / 2);
            mazeGroup.add(ceiling);

            // Walls
            if (cell.walls.N) {
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(corridorSize, wallHeight, wallThickness),
                    wallMaterial
                );
                wall.position.set(x + corridorSize / 2, wallHeight / 2, z);
                mazeGroup.add(wall);
            }
            if (cell.walls.S) {
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(corridorSize, wallHeight, wallThickness),
                    wallMaterial
                );
                wall.position.set(x + corridorSize / 2, wallHeight / 2, z + corridorSize);
                mazeGroup.add(wall);
            }
            if (cell.walls.W) {
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(wallThickness, wallHeight, corridorSize),
                    wallMaterial
                );
                wall.position.set(x, wallHeight / 2, z + corridorSize / 2);
                mazeGroup.add(wall);
            }
            if (cell.walls.E) {
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(wallThickness, wallHeight, corridorSize),
                    wallMaterial
                );
                wall.position.set(x + corridorSize, wallHeight / 2, z + corridorSize / 2);
                mazeGroup.add(wall);
            }
        }
    }

    // Add lights at some intersections (sparse to avoid shader limits)
    let lightCount = 0;
    const maxLights = 16;
    const lightStep = Math.max(6, Math.floor(Math.sqrt(rows * cols / maxLights)));
    for (let r = 2; r < rows && lightCount < maxLights; r += lightStep) {
        for (let c = 2; c < cols && lightCount < maxLights; c += lightStep) {
            if (!grid[r] || !grid[r][c] || !grid[r][c].inside) continue;
            const x = c * corridorSize + offsetX + corridorSize / 2;
            const z = r * corridorSize + offsetZ + corridorSize / 2;

            const light = new THREE.PointLight(0x4ade80, 1.0, corridorSize * 10);
            light.position.set(x, wallHeight - 0.3, z);
            mazeGroup.add(light);
            lights.push(light);
            lightCount++;
        }
    }

    // Start marker
    const startX = startPos.col * corridorSize + offsetX + corridorSize / 2;
    const startZ = startPos.row * corridorSize + offsetZ + corridorSize / 2;
    const startLight = new THREE.PointLight(0x22d3ee, 2, corridorSize * 6);
    startLight.position.set(startX, 1.5, startZ);
    mazeGroup.add(startLight);

    const startMarker = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.6, 32),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide })
    );
    startMarker.rotation.x = -Math.PI / 2;
    startMarker.position.set(startX, 0.05, startZ);
    mazeGroup.add(startMarker);

    // Exit marker
    const exitX = exitPos.col * corridorSize + offsetX + corridorSize / 2;
    const exitZ = exitPos.row * corridorSize + offsetZ + corridorSize / 2;
    const exitLight = new THREE.PointLight(0xf472b6, 2, corridorSize * 6);
    exitLight.position.set(exitX, 1.5, exitZ);
    mazeGroup.add(exitLight);

    const exitMarker = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.1, 16, 32),
        new THREE.MeshBasicMaterial({ color: 0xf472b6 })
    );
    exitMarker.rotation.x = -Math.PI / 2;
    exitMarker.position.set(exitX, 0.05, exitZ);
    exitMarker.userData.isExit = true;
    mazeGroup.add(exitMarker);

    return {
        group: mazeGroup,
        corridorSize,
        offsetX,
        offsetZ,
        startWorld: { x: startX, y: 1.5, z: startZ },
        exitWorld: { x: exitX, y: 1.5, z: exitZ },
        wallHeight,
        lights
    };
}

// --- Get wall boxes for collision ---

function getWallColliders(grid, rows, cols, corridorSize, offsetX, offsetZ) {
    const colliders = [];
    const wallThickness = 0.3;
    const wallHeight = 3;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.inside) continue;

            const x = c * corridorSize + offsetX;
            const z = r * corridorSize + offsetZ;

            if (cell.walls.N) {
                colliders.push({
                    minX: x, maxX: x + corridorSize,
                    minY: 0, maxY: wallHeight,
                    minZ: z - wallThickness / 2, maxZ: z + wallThickness / 2
                });
            }
            if (cell.walls.S) {
                colliders.push({
                    minX: x, maxX: x + corridorSize,
                    minY: 0, maxY: wallHeight,
                    minZ: z + corridorSize - wallThickness / 2, maxZ: z + corridorSize + wallThickness / 2
                });
            }
            if (cell.walls.W) {
                colliders.push({
                    minX: x - wallThickness / 2, maxX: x + wallThickness / 2,
                    minY: 0, maxY: wallHeight,
                    minZ: z, maxZ: z + corridorSize
                });
            }
            if (cell.walls.E) {
                colliders.push({
                    minX: x + corridorSize - wallThickness / 2, maxX: x + corridorSize + wallThickness / 2,
                    minY: 0, maxY: wallHeight,
                    minZ: z, maxZ: z + corridorSize
                });
            }
        }
    }

    // Also add boundary colliders for outside cells adjacent to inside cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c].inside) continue;
            // Check all 4 neighbors; if neighbor is outside or out of bounds, that wall stays
            // (already handled by default walls being true for boundary cells)
        }
    }

    return colliders;
}

export {
    SLIME_SVG_PATH, SVG_WIDTH, SVG_HEIGHT, CELL_SIZE,
    svgPathToPolygon, pointInPolygon, buildGrid, generateMaze,
    buildMazeGeometry, getWallColliders
};
