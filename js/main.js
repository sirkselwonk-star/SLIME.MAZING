// main.js — Scene setup, render loop, game orchestration

import * as THREE from 'three';
import {
    SLIME_SVG_PATH, CELL_SIZE,
    svgPathToPolygon, buildGrid, generateMaze,
    buildMazeGeometry, getWallColliders
} from './maze.js';
import { ShipControls } from './controls.js';
import { HUD } from './hud.js';
import { GameState } from './game.js';

window.THREE = THREE;

let scene, camera, renderer;
let controls, hud, gameState;
let mazeData, colliders, oreGroup;
let gridData;
let clock;
let particles;
let headlight;

function init() {
    clock = new THREE.Clock();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.0;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020208);
    scene.fog = new THREE.FogExp2(0x020208, 0.025);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

    // Ambient light
    const ambient = new THREE.AmbientLight(0x222244, 0.8);
    scene.add(ambient);

    // Ship headlight (attached to camera)
    headlight = new THREE.SpotLight(0xccddff, 8, 40, Math.PI / 3, 0.3, 0.8);
    headlight.target.position.set(0, 0, -1);
    camera.add(headlight);
    camera.add(headlight.target);

    // Ambient ship glow
    const shipGlow = new THREE.PointLight(0x4ade80, 1.5, 12);
    shipGlow.position.set(0, 0, 0);
    camera.add(shipGlow);

    scene.add(camera);

    // Controls
    controls = new ShipControls(camera);

    // HUD
    const hudCanvas = document.getElementById('hud-canvas');
    hud = new HUD(hudCanvas);

    // Game state
    gameState = new GameState();
    window._gameState = gameState;
    window._debug = { scene, camera, renderer, get mazeData() { return mazeData; }, get gridData() { return gridData; }, get colliders() { return colliders; } };

    // Build maze
    buildLevel();

    // Events
    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('click', () => {
        if (gameState.state === 'MENU') {
            startGame();
        } else if (gameState.state === 'PLAYING') {
            controls.lockPointer(renderer.domElement);
        } else if (gameState.state === 'LEVEL_COMPLETE') {
            // Restart
            scene.clear();
            const ambient = new THREE.AmbientLight(0x111133, 0.3);
            scene.add(ambient);
            buildLevel();
            startGame();
        }
    });

    // Create engine exhaust particles
    createParticles(THREE);

    // Start render loop
    animate();
}

function buildLevel() {
    // Show loading
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    // Use requestAnimationFrame to let the loading screen render
    requestAnimationFrame(() => {
        // Parse SVG path → polygon
        const polygon = svgPathToPolygon(SLIME_SVG_PATH, 2000);

        // Build grid
        gridData = buildGrid(polygon);

        // Generate maze
        const { start, exit } = generateMaze(gridData.grid, gridData.rows, gridData.cols);

        if (!start || !exit) {
            console.error('Maze generation failed - no inside cells found');
            return;
        }

        // Build 3D geometry
        mazeData = buildMazeGeometry(
            gridData.grid, gridData.rows, gridData.cols,
            start, exit, THREE
        );
        scene.add(mazeData.group);

        // Get collision boxes
        colliders = getWallColliders(
            gridData.grid, gridData.rows, gridData.cols,
            mazeData.corridorSize, mazeData.offsetX, mazeData.offsetZ
        );

        // Spawn ore
        oreGroup = gameState.spawnOre(
            gridData.grid, gridData.rows, gridData.cols,
            mazeData.corridorSize, mazeData.offsetX, mazeData.offsetZ, THREE
        );
        scene.add(oreGroup);

        // Position camera at start
        camera.position.set(
            mazeData.startWorld.x,
            mazeData.startWorld.y,
            mazeData.startWorld.z
        );
        camera.quaternion.identity();

        // Hide loading
        if (loadingEl) loadingEl.style.display = 'none';
    });
}

function startGame() {
    gameState.state = 'PLAYING';
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('level-complete').style.display = 'none';
    controls.lockPointer(renderer.domElement);
}

function createParticles(THREE) {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 2] = Math.random() * 0.5;
        velocities.push({
            x: (Math.random() - 0.5) * 0.5,
            y: (Math.random() - 0.5) * 0.5,
            z: Math.random() * 2 + 1
        });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color: 0x4ade80,
        size: 0.03,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    particles = {
        mesh: new THREE.Points(geo, mat),
        velocities,
        count
    };

    scene.add(particles.mesh);
}

function updateParticles(dt) {
    if (!particles || !controls) return;

    const positions = particles.mesh.geometry.attributes.position.array;
    const speed = controls.getSpeed();

    // Only show particles when moving
    particles.mesh.material.opacity = Math.min(0.6, speed * 0.1);

    // Position particles behind camera
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    const basePos = camera.position.clone().add(back.multiplyScalar(0.5));

    for (let i = 0; i < particles.count; i++) {
        positions[i * 3 + 2] += particles.velocities[i].z * dt;

        if (positions[i * 3 + 2] > 1.5) {
            positions[i * 3] = (Math.random() - 0.5) * 0.3;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
            positions[i * 3 + 2] = 0;
        }
    }

    particles.mesh.position.copy(basePos);
    particles.mesh.quaternion.copy(camera.quaternion);
    particles.mesh.geometry.attributes.position.needsUpdate = true;
}

function getPlayerGridPos() {
    if (!mazeData || !gridData) return null;

    const col = Math.floor(
        (camera.position.x - mazeData.offsetX) / mazeData.corridorSize
    );
    const row = Math.floor(
        (camera.position.z - mazeData.offsetZ) / mazeData.corridorSize
    );

    return {
        row: Math.max(0, Math.min(gridData.rows - 1, row)),
        col: Math.max(0, Math.min(gridData.cols - 1, col))
    };
}

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    if (gameState.state === 'PLAYING') {
        controls.update(dt, colliders);

        // Update game logic
        gameState.update(camera.position, mazeData?.exitWorld, dt);

        // Update visited cells for minimap
        const gridPos = getPlayerGridPos();
        if (gridPos) {
            gameState.updateVisited(gridPos.row, gridPos.col);
        }

        // Update particles
        updateParticles(dt);

        // Animate maze lights
        if (mazeData && mazeData.lights) {
            const time = Date.now() * 0.001;
            for (let i = 0; i < mazeData.lights.length; i++) {
                mazeData.lights[i].intensity = 0.4 + Math.sin(time + i * 0.7) * 0.2;
            }
        }

        // Check level complete
        if (gameState.state === 'LEVEL_COMPLETE') {
            document.getElementById('level-complete').style.display = 'flex';
            document.exitPointerLock();

            const scoreEl = document.getElementById('final-score');
            if (scoreEl) {
                scoreEl.textContent = `${gameState.oreCollected} / ${gameState.oreTotal}`;
            }
        }
    }

    // Get heading for compass
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const heading = Math.atan2(forward.x, forward.z);

    // Draw HUD
    const gridPos = getPlayerGridPos();
    hud.draw({
        grid: gridData?.grid,
        rows: gridData?.rows,
        cols: gridData?.cols,
        playerGridPos: gridPos,
        startPos: mazeData ? {
            row: Math.floor((mazeData.startWorld.z - mazeData.offsetZ) / mazeData.corridorSize),
            col: Math.floor((mazeData.startWorld.x - mazeData.offsetX) / mazeData.corridorSize)
        } : null,
        exitPos: mazeData ? {
            row: Math.floor((mazeData.exitWorld.z - mazeData.offsetZ) / mazeData.corridorSize),
            col: Math.floor((mazeData.exitWorld.x - mazeData.offsetX) / mazeData.corridorSize)
        } : null,
        visitedCells: gameState.visitedCells,
        heading,
        oreCollected: gameState.oreCollected,
        oreTotal: gameState.oreTotal,
        speed: controls.getSpeed(),
        exitUnlocked: gameState.exitUnlocked
    });

    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    hud.resize();
}

// Start when Three.js is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
