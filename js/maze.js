// maze.js — SVG path → polygon → grid → maze generation

import { random } from './rng.js?v=1';

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
            const chosen = neighbors[Math.floor(random() * neighbors.length)];
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

/**
 * For an L-junction (exactly 2 perpendicular walls), returns which corner-block
 * quadrant is uncovered: 'NW' / 'NE' / 'SW' / 'SE'. Returns null for straight
 * sections, T-junctions, crosses, or no walls. Used to compute miter offsets so
 * walls join at a 45° diagonal instead of leaving a wallThickness-square gap.
 */
function cornerGapDirection(grid, r, c) {
    const ne = (grid[r - 1] && grid[r - 1][c]) || null;
    const nw = (grid[r - 1] && grid[r - 1][c - 1]) || null;
    const se = (grid[r] && grid[r][c]) || null;
    const sw = (grid[r] && grid[r][c - 1]) || null;

    const hasN = !!((ne && ne.inside && ne.walls && ne.walls.W) ||
                    (nw && nw.inside && nw.walls && nw.walls.E));
    const hasS = !!((se && se.inside && se.walls && se.walls.W) ||
                    (sw && sw.inside && sw.walls && sw.walls.E));
    const hasE = !!((se && se.inside && se.walls && se.walls.N) ||
                    (ne && ne.inside && ne.walls && ne.walls.S));
    const hasW = !!((sw && sw.inside && sw.walls && sw.walls.N) ||
                    (nw && nw.inside && nw.walls && nw.walls.S));

    const perp = (hasN || hasS) && (hasE || hasW);
    if (!perp) return null;
    if (!hasN && !hasW) return 'NW';
    if (!hasN && !hasE) return 'NE';
    if (!hasS && !hasW) return 'SW';
    if (!hasS && !hasE) return 'SE';
    return null;  // T-junction or cross
}

/**
 * Returns plan-view {SW, SE, NE, NW} corner positions [x, z] for one of a
 * cell's four walls, with miter offsets applied at L-junctions so the wall's
 * end-cap is a 45° diagonal that mates flush with the adjacent perpendicular
 * wall. T-junctions/crosses use default rectangular footprint.
 */
function getWallFootprint(grid, r, c, dir, corridorSize, T, offsetX, offsetZ) {
    const T2 = T / 2;
    const x = c * corridorSize + offsetX;
    const z = r * corridorSize + offsetZ;
    const xR = x + corridorSize;
    const zS = z + corridorSize;

    let SW, SE, NE, NW;

    if (dir === 'N') {
        SW = [x, z + T2];   NW = [x, z - T2];
        SE = [xR, z + T2];  NE = [xR, z - T2];
        const g1 = cornerGapDirection(grid, r, c);
        if (g1 === 'SW') { SW[0] -= T2; NW[0] += T2; }
        else if (g1 === 'NW') { SW[0] += T2; NW[0] -= T2; }
        const g2 = cornerGapDirection(grid, r, c + 1);
        if (g2 === 'SE') { SE[0] += T2; NE[0] -= T2; }
        else if (g2 === 'NE') { SE[0] -= T2; NE[0] += T2; }
    } else if (dir === 'S') {
        SW = [x, zS + T2];   NW = [x, zS - T2];
        SE = [xR, zS + T2];  NE = [xR, zS - T2];
        const g1 = cornerGapDirection(grid, r + 1, c);
        if (g1 === 'SW') { SW[0] -= T2; NW[0] += T2; }
        else if (g1 === 'NW') { SW[0] += T2; NW[0] -= T2; }
        const g2 = cornerGapDirection(grid, r + 1, c + 1);
        if (g2 === 'SE') { SE[0] += T2; NE[0] -= T2; }
        else if (g2 === 'NE') { SE[0] -= T2; NE[0] += T2; }
    } else if (dir === 'W') {
        SW = [x - T2, zS];  SE = [x + T2, zS];
        NW = [x - T2, z];   NE = [x + T2, z];
        const g1 = cornerGapDirection(grid, r, c);
        if (g1 === 'NW') { NW[1] -= T2; NE[1] += T2; }
        else if (g1 === 'NE') { NW[1] += T2; NE[1] -= T2; }
        const g2 = cornerGapDirection(grid, r + 1, c);
        if (g2 === 'SW') { SW[1] += T2; SE[1] -= T2; }
        else if (g2 === 'SE') { SW[1] -= T2; SE[1] += T2; }
    } else { // 'E'
        SW = [xR - T2, zS];  SE = [xR + T2, zS];
        NW = [xR - T2, z];   NE = [xR + T2, z];
        const g1 = cornerGapDirection(grid, r, c + 1);
        if (g1 === 'NW') { NW[1] -= T2; NE[1] += T2; }
        else if (g1 === 'NE') { NW[1] += T2; NE[1] -= T2; }
        const g2 = cornerGapDirection(grid, r + 1, c + 1);
        if (g2 === 'SW') { SW[1] += T2; SE[1] -= T2; }
        else if (g2 === 'SE') { SW[1] -= T2; SE[1] += T2; }
    }
    return { SW, SE, NE, NW };
}

/**
 * Build a wall mesh as a 5-face box (no bottom) using the plan-view footprint.
 * The footprint may be a parallelogram-like polygon when miter offsets shift
 * end vertices, so we build BufferGeometry directly rather than BoxGeometry.
 *
 * Each face gets its own 4 vertices (20 total) so:
 *   - per-face UVs map (0..1, 0..1) — required by the Eyes Bleed shader's vUv
 *   - computeVertexNormals produces flat shading instead of averaging across
 *     adjacent faces at shared corners
 */
function buildMiteredWallGeo(THREE, footprint, height, centerX = 0, centerZ = 0) {
    const { SW, SE, NE, NW } = footprint;
    // Vertices are stored in mesh-local space (world position - center) so
    // wall.position can carry the wall's center for downstream consumers.
    const halfH = height / 2;
    const bSW = [SW[0] - centerX, -halfH, SW[1] - centerZ];   const tSW = [SW[0] - centerX, halfH, SW[1] - centerZ];
    const bSE = [SE[0] - centerX, -halfH, SE[1] - centerZ];   const tSE = [SE[0] - centerX, halfH, SE[1] - centerZ];
    const bNE = [NE[0] - centerX, -halfH, NE[1] - centerZ];   const tNE = [NE[0] - centerX, halfH, NE[1] - centerZ];
    const bNW = [NW[0] - centerX, -halfH, NW[1] - centerZ];   const tNW = [NW[0] - centerX, halfH, NW[1] - centerZ];

    const positions = [];
    const uvs = [];
    const indices = [];
    let v = 0;

    // Add a quad as two triangles. p0..p3 must be CCW viewed from outside;
    // UVs map p0=(0,0), p1=(1,0), p2=(1,1), p3=(0,1).
    const addQuad = (p0, p1, p2, p3) => {
        positions.push(...p0, ...p1, ...p2, ...p3);
        uvs.push(0, 0,  1, 0,  1, 1,  0, 1);
        indices.push(v, v + 1, v + 2,  v, v + 2, v + 3);
        v += 4;
    };

    addQuad(bSW, bSE, tSE, tSW);  // South face (+z out)
    addQuad(bSE, bNE, tNE, tSE);  // East  face (+x out)
    addQuad(bNE, bNW, tNW, tNE);  // North face (-z out)
    addQuad(bNW, bSW, tSW, tNW);  // West  face (-x out)
    addQuad(tSW, tSE, tNE, tNW);  // Top   face (+y out)

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

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
    const wallMeshes = {};
    const floorMeshes = {};
    const ceilingMeshes = {};
    const lights = [];

    // Offset so maze is centered at origin
    const offsetX = -(cols * corridorSize) / 2;
    const offsetZ = -(rows * corridorSize) / 2;

    // Count inside cells once so we can size the floor/ceiling InstancedMeshes.
    // Floors and ceilings are otherwise identical PlaneGeometry at unique
    // world positions — perfect for instancing (1,236+ draw calls → 2).
    let insideCount = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c].inside) insideCount++;
        }
    }

    // Bake the floor/ceiling rotation into the geometry so each instance only
    // needs a translation matrix.
    const floorPlaneGeo = new THREE.PlaneGeometry(corridorSize, corridorSize);
    floorPlaneGeo.rotateX(-Math.PI / 2);
    const ceilingPlaneGeo = new THREE.PlaneGeometry(corridorSize, corridorSize);
    ceilingPlaneGeo.rotateX(Math.PI / 2);

    const floorInstanced = new THREE.InstancedMesh(floorPlaneGeo, floorMaterial, insideCount);
    const ceilingInstanced = new THREE.InstancedMesh(ceilingPlaneGeo, ceilingMaterial, insideCount);
    mazeGroup.add(floorInstanced);
    mazeGroup.add(ceilingInstanced);

    const tmpMat4 = new THREE.Matrix4();
    let cellInstance = 0;

    // Walls are queued here, then merged per 6×6 EyesBleed zone in a second
    // pass after the cell loop. Each zone becomes one Mesh; per-wall
    // placeholders carry the position + visibility-with-cascade contract that
    // gallery.js and weapons.js depend on.
    const pendingWalls = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.inside) continue;

            const x = c * corridorSize + offsetX;
            const z = r * corridorSize + offsetZ;
            const cellCx = x + corridorSize / 2;
            const cellCz = z + corridorSize / 2;

            // Floor instance — y=0
            tmpMat4.makeTranslation(cellCx, 0, cellCz);
            floorInstanced.setMatrixAt(cellInstance, tmpMat4);
            // Stub stores enough info for two consumers:
            //   - eyesbleed particle/laser spawn reads .position
            //   - eyesbleed sparse-effect mode hides the base instance and
            //     drops a per-cell effect Mesh at the same spot, then
            //     restores the instance on deactivate.
            floorMeshes[`${r},${c}`] = {
                position: new THREE.Vector3(cellCx, 0, cellCz),
                visible: true,
                instanceIdx: cellInstance,
                instancedMesh: floorInstanced
            };

            // Ceiling instance — y=wallHeight
            tmpMat4.makeTranslation(cellCx, wallHeight, cellCz);
            ceilingInstanced.setMatrixAt(cellInstance, tmpMat4);
            ceilingMeshes[`${r},${c}`] = {
                position: new THREE.Vector3(cellCx, wallHeight, cellCz),
                visible: true,
                instanceIdx: cellInstance,
                instancedMesh: ceilingInstanced
            };

            cellInstance++;

            // Walls — collected per-zone for merging below. Each wall keeps
            // its mitered footprint (L-corner 45° seams). Per-zone merge
            // collapses ~2,500 wall draw calls into ~25 zone draws and lines
            // up perfectly with EyesBleed's existing 6×6 zone effect grouping.
            for (const dir of ['N', 'S', 'W', 'E']) {
                if (!cell.walls[dir]) continue;
                const fp = getWallFootprint(grid, r, c, dir, corridorSize, wallThickness, offsetX, offsetZ);
                let wcx, wcz;
                if (dir === 'N')      { wcx = x + corridorSize / 2; wcz = z; }
                else if (dir === 'S') { wcx = x + corridorSize / 2; wcz = z + corridorSize; }
                else if (dir === 'W') { wcx = x;                    wcz = z + corridorSize / 2; }
                else /* 'E' */        { wcx = x + corridorSize;     wcz = z + corridorSize / 2; }
                const geo = buildMiteredWallGeo(THREE, fp, wallHeight, wcx, wcz);
                pendingWalls.push({ r, c, dir, geo, cx: wcx, cz: wcz });
            }
        }
    }

    // ---- Per-zone wall merge ----
    // Group walls by their cell's 6×6 EyesBleed zone, then merge each zone's
    // wall geometries into one BufferGeometry. The result is one Mesh per zone
    // (~25 zones for a typical SLIME map) instead of ~2,500 wall meshes —
    // matching draw call drop. Per-wall Object3D placeholders preserve the
    // existing contract: gallery.js parents paintings to wall.add(group) and
    // reads wall.position + wall.visible; weapons.js sets wall.visible=false
    // on rocket impact. Hiding a wall zeros its vertex range in the merged
    // geometry so the wall actually disappears.
    const wallZoneMeshes = {};
    const wallsByZone = new Map();
    for (const w of pendingWalls) {
        const zoneKey = `${Math.floor(w.r / 6)},${Math.floor(w.c / 6)}`;
        if (!wallsByZone.has(zoneKey)) wallsByZone.set(zoneKey, []);
        wallsByZone.get(zoneKey).push(w);
    }

    for (const [zoneKey, walls] of wallsByZone) {
        // Compute total vertex/index counts for the zone
        let totalVerts = 0, totalIdx = 0;
        for (const w of walls) {
            totalVerts += w.geo.attributes.position.count;
            totalIdx += w.geo.index.count;
        }
        const positions = new Float32Array(totalVerts * 3);
        const uvs = new Float32Array(totalVerts * 2);
        // 16-bit index is fine when totalVerts < 65536; use 32-bit unconditionally
        // since some zones may exceed that. The few KB cost is irrelevant.
        const indices = new Uint32Array(totalIdx);

        let posOff = 0, uvOff = 0, idxOff = 0;
        for (const w of walls) {
            const wp = w.geo.attributes.position.array;
            const wu = w.geo.attributes.uv.array;
            const wi = w.geo.index.array;
            const baseVert = posOff / 3;
            // Per-wall geometry was built in mesh-local space (centered at
            // the wall's center) — translate to world space here so we can
            // discard the per-wall transform and just put one Mesh at origin.
            for (let v = 0; v < wp.length; v += 3) {
                positions[posOff + v]     = wp[v]     + w.cx;
                positions[posOff + v + 1] = wp[v + 1] + wallHeight / 2;
                positions[posOff + v + 2] = wp[v + 2] + w.cz;
            }
            posOff += wp.length;
            uvs.set(wu, uvOff);
            uvOff += wu.length;
            for (let i = 0; i < wi.length; i++) {
                indices[idxOff + i] = wi[i] + baseVert;
            }
            idxOff += wi.length;
            w.vertStart = baseVert;
            w.vertEnd = posOff / 3; // exclusive
            // Per-wall geometry has been copied; release it.
            w.geo.dispose();
        }

        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        merged.setIndex(new THREE.BufferAttribute(indices, 1));
        merged.computeVertexNormals();

        const zoneMesh = new THREE.Mesh(merged, wallMaterial);
        // Zone bounds can span dozens of meters; default per-mesh frustum
        // culling can mis-cull on tight corridor angles. Walls being culled
        // into invisibility mid-corridor is worse than the cost of always
        // submitting the draw.
        zoneMesh.frustumCulled = false;
        mazeGroup.add(zoneMesh);
        wallZoneMeshes[zoneKey] = zoneMesh;

        // Per-wall Object3D placeholders. Paintings parent here, so the
        // existing visibility cascade still hides paintings when the wall
        // is destroyed. Overriding .visible's setter zeros that wall's
        // vertex range in the merged geometry so the wall actually vanishes.
        for (const w of walls) {
            const placeholder = new THREE.Object3D();
            placeholder.position.set(w.cx, wallHeight / 2, w.cz);
            placeholder.userData.zoneMesh = zoneMesh;
            placeholder.userData.vertStart = w.vertStart;
            placeholder.userData.vertEnd = w.vertEnd;
            const vertStart = w.vertStart, vertEnd = w.vertEnd;
            let _vis = true;
            Object.defineProperty(placeholder, 'visible', {
                get() { return _vis; },
                set(v) {
                    if (v === _vis) return;
                    _vis = v;
                    if (v) return; // unhide is not used in this game
                    const posAttr = zoneMesh.geometry.attributes.position;
                    const arr = posAttr.array;
                    for (let vi = vertStart; vi < vertEnd; vi++) {
                        arr[vi * 3] = 0;
                        arr[vi * 3 + 1] = 0;
                        arr[vi * 3 + 2] = 0;
                    }
                    posAttr.needsUpdate = true;
                },
                configurable: true
            });
            mazeGroup.add(placeholder);
            wallMeshes[`${w.r},${w.c},${w.dir}`] = placeholder;
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
        wallMeshes,
        wallZoneMeshes,
        floorMeshes,
        ceilingMeshes,
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

function getWallColliders(grid, rows, cols, corridorSize, offsetX, offsetZ, wallMeshes) {
    const colliders = [];
    const wallThickness = 0.3;
    const wallHeight = 3;

    // A wall is a perimeter wall if its neighbor cell is out of bounds or !inside.
    // Perimeter walls are flagged so weapons.js can refuse to blow them out
    // (lets the player look at the whole maze from outside, blowing memory).
    const deltas = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
    const isPerimeter = (r, c, dir) => {
        const [dr, dc] = deltas[dir];
        const nr = r + dr, nc = c + dc;
        return !grid[nr] || !grid[nr][nc] || !grid[nr][nc].inside;
    };

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
                    minZ: z - wallThickness / 2, maxZ: z + wallThickness / 2,
                    mesh: wallMeshes ? wallMeshes[`${r},${c},N`] : null,
                    gridRef: { row: r, col: c, dir: 'N' },
                    isPerimeter: isPerimeter(r, c, 'N')
                });
            }
            if (cell.walls.S) {
                colliders.push({
                    minX: x, maxX: x + corridorSize,
                    minY: 0, maxY: wallHeight,
                    minZ: z + corridorSize - wallThickness / 2, maxZ: z + corridorSize + wallThickness / 2,
                    mesh: wallMeshes ? wallMeshes[`${r},${c},S`] : null,
                    gridRef: { row: r, col: c, dir: 'S' },
                    isPerimeter: isPerimeter(r, c, 'S')
                });
            }
            if (cell.walls.W) {
                colliders.push({
                    minX: x - wallThickness / 2, maxX: x + wallThickness / 2,
                    minY: 0, maxY: wallHeight,
                    minZ: z, maxZ: z + corridorSize,
                    mesh: wallMeshes ? wallMeshes[`${r},${c},W`] : null,
                    gridRef: { row: r, col: c, dir: 'W' },
                    isPerimeter: isPerimeter(r, c, 'W')
                });
            }
            if (cell.walls.E) {
                colliders.push({
                    minX: x + corridorSize - wallThickness / 2, maxX: x + corridorSize + wallThickness / 2,
                    minY: 0, maxY: wallHeight,
                    minZ: z, maxZ: z + corridorSize,
                    mesh: wallMeshes ? wallMeshes[`${r},${c},E`] : null,
                    gridRef: { row: r, col: c, dir: 'E' },
                    isPerimeter: isPerimeter(r, c, 'E')
                });
            }
        }
    }

    // No pillar colliders — walls are mitered to fill the corner block, and
    // existing AABB colliders + player radius keep the player out of the
    // wallThickness-square corner area at L-junctions.

    return colliders;
}

export {
    SLIME_SVG_PATH, SVG_WIDTH, SVG_HEIGHT, CELL_SIZE,
    svgPathToPolygon, pointInPolygon, buildGrid, generateMaze,
    buildMazeGeometry, getWallColliders
};
