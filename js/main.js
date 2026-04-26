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
import { WeaponSystem } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { SoundtrackManager } from './audio.js';
import { GalleryManager } from './gallery.js';
import { EyesBleedManager } from './eyesbleed.js';

window.THREE = THREE;

let scene, camera, renderer;
let controls, hud, gameState;
let mazeData, colliders, oreGroup;
let gridData;
let clock;
let particles;
let headlight;
let weapons, enemyManager;
let soundtrack;
let gallery;
let eyesBleed;

// Locked aspect ratio
const TARGET_ASPECT = 16 / 9;
const TARGET_FOV = 65;

function init() {
    clock = new THREE.Clock();

    // Renderer — locked 16:9 aspect ratio
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.0;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020208);
    scene.fog = new THREE.FogExp2(0x020208, 0.025);

    // Camera — fixed FOV and aspect
    camera = new THREE.PerspectiveCamera(TARGET_FOV, TARGET_ASPECT, 0.1, 200);

    // Apply initial letterboxed size
    applyViewportSize();

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

    // Soundtrack
    soundtrack = new SoundtrackManager();

    // M key to toggle mute, B key to toggle Eyes Bleed
    document.addEventListener('keydown', e => {
        if (e.code === 'KeyM') {
            const muted = soundtrack.toggleMute();
            console.log(muted ? 'Audio muted' : 'Audio unmuted');
        }
        if (e.code === 'KeyB' && gameState.state === 'PLAYING' && mazeData) {
            if (eyesBleed.isActive) {
                eyesBleed.deactivate();
            } else {
                eyesBleed.activate(mazeData.wallMeshes);
            }
        }
    });
    window._debug = { scene, camera, renderer, get mazeData() { return mazeData; }, get gridData() { return gridData; }, get colliders() { return colliders; } };

    // Build maze
    buildLevel();

    // Events
    window.addEventListener('resize', onResize);

    // Show pause screen when pointer lock is lost during gameplay
    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement && gameState && gameState.state === 'PLAYING') {
            const menu = document.getElementById('menu-screen');
            const title = menu.querySelector('h1');
            const subtitle = menu.querySelector('.subtitle');
            const prompt = menu.querySelector('.prompt');
            title.textContent = 'PAUSED';
            subtitle.textContent = 'SLIME.MAZING';
            prompt.textContent = '[ CLICK TO RESUME ]';
            menu.style.display = 'flex';
        }
    });

    function handleClick() {
        if (gameState.state === 'MENU') {
            startGame();
        } else if (gameState.state === 'PLAYING') {
            document.getElementById('menu-screen').style.display = 'none';
            controls.lockPointer(renderer.domElement);
        } else if (gameState.state === 'LEVEL_COMPLETE') {
            restartGame();
        }
    }

    renderer.domElement.addEventListener('click', handleClick);
    document.getElementById('menu-screen').addEventListener('click', handleClick);
    document.getElementById('level-complete').addEventListener('click', handleClick);

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

        // Get collision boxes (with wall mesh refs for destruction)
        colliders = getWallColliders(
            gridData.grid, gridData.rows, gridData.cols,
            mazeData.corridorSize, mazeData.offsetX, mazeData.offsetZ,
            mazeData.wallMeshes
        );

        // Spawn ore
        oreGroup = gameState.spawnOre(
            gridData.grid, gridData.rows, gridData.cols,
            mazeData.corridorSize, mazeData.offsetX, mazeData.offsetZ, THREE
        );
        scene.add(oreGroup);

        // Weapon system
        weapons = new WeaponSystem(scene, THREE);
        weapons.onExplosion = () => soundtrack.playExplosionSound();

        // Enemy spawning
        enemyManager = new EnemyManager(scene, THREE);
        enemyManager.spawnEnemies(
            gridData.grid, gridData.rows, gridData.cols,
            mazeData.corridorSize, mazeData.offsetX, mazeData.offsetZ,
            { row: Math.floor((mazeData.startWorld.z - mazeData.offsetZ) / mazeData.corridorSize),
              col: Math.floor((mazeData.startWorld.x - mazeData.offsetX) / mazeData.corridorSize) },
            { row: Math.floor((mazeData.exitWorld.z - mazeData.offsetZ) / mazeData.corridorSize),
              col: Math.floor((mazeData.exitWorld.x - mazeData.offsetX) / mazeData.corridorSize) }
        );

        // Position camera at start
        camera.position.set(
            mazeData.startWorld.x,
            mazeData.startWorld.y,
            mazeData.startWorld.z
        );
        camera.quaternion.identity();

        // Gallery — SLIME NFT paintings on walls with loading progress
        gallery = new GalleryManager();
        const loadingText = loadingEl?.querySelector('p');
        gallery.placeArtwork(mazeData.wallMeshes, THREE, renderer, (loaded, total) => {
            if (loadingText) loadingText.textContent = `LOADING GALLERY: ${loaded} / ${total}`;
        }).then(() => {
            if (loadingEl) loadingEl.style.display = 'none';
        });

        // Eyes Bleed manager
        eyesBleed = new EyesBleedManager();
    });
}

function startGame() {
    gameState.state = 'PLAYING';
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('level-complete').style.display = 'none';
    controls.lockPointer(renderer.domElement);
    // Start soundtrack on first user gesture (browser autoplay policy)
    soundtrack.start();
}

function restartGame() {
    // Remove old maze and ore groups from scene
    if (mazeData && mazeData.group) scene.remove(mazeData.group);
    if (oreGroup) scene.remove(oreGroup);
    if (weapons) weapons.cleanup();
    if (enemyManager) enemyManager.cleanup();
    if (gallery) gallery.cleanup();
    if (eyesBleed) eyesBleed.cleanup();

    // Reset game state
    gameState = new GameState();
    window._gameState = gameState;

    // Rebuild maze
    buildLevel();

    // Reset menu title back to normal for next pause
    const menu = document.getElementById('menu-screen');
    menu.querySelector('h1').textContent = 'SLIME.MAZING';
    menu.querySelector('.subtitle').textContent = 'DESCENT INTO THE SLIME';
    menu.querySelector('.prompt').textContent = '[ CLICK TO START ]';

    // Reset level-complete heading (may have been changed to DESTROYED)
    document.getElementById('level-complete').querySelector('h2').textContent = 'LEVEL COMPLETE';

    // Start playing
    startGame();
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

        // Handle firing — gun (left click / held), rocket (right click)
        if (controls.gunHeld) controls.firing.gun = true;
        if (controls.firing.gun && weapons.canFire('gun') && gameState.gunAmmo > 0) {
            weapons.fire('gun', camera);
            weapons.startCooldown('gun');
            gameState.gunAmmo--;
            soundtrack.playGunSound();
        }
        if (controls.firing.rocket && weapons.canFire('rocket') && gameState.rocketAmmo > 0) {
            weapons.fire('rocket', camera);
            weapons.startCooldown('rocket');
            gameState.rocketAmmo--;
            soundtrack.playRocketSound();
        }
        controls.firing.gun = false;
        controls.firing.rocket = false;

        // Update weapons
        const enemyList = enemyManager ? enemyManager.enemies : [];
        if (weapons) weapons.update(dt, colliders, enemyList, gridData?.grid);

        // Count kills
        if (enemyManager) {
            let killed = 0;
            for (const e of enemyManager.enemies) {
                if (!e.alive || e.dying) killed++;
            }
            gameState.enemiesKilled = killed;
        }

        // Update enemies + apply contact damage
        if (enemyManager && mazeData) {
            const contactDmg = enemyManager.update(
                dt, camera.position, colliders,
                gridData.grid, mazeData.corridorSize,
                mazeData.offsetX, mazeData.offsetZ
            );
            if (contactDmg > 0) {
                gameState.playerHP = Math.max(0, gameState.playerHP - contactDmg);
                gameState.damageFlash = 1;
            }
        }

        // Fade damage flash
        if (gameState.damageFlash > 0) gameState.damageFlash = Math.max(0, gameState.damageFlash - dt * 3);

        // Update game logic
        gameState.update(camera.position, mazeData?.exitWorld, dt);

        // Update visited cells for minimap
        const gridPos = getPlayerGridPos();
        if (gridPos) {
            gameState.updateVisited(gridPos.row, gridPos.col);
        }

        // Update particles
        updateParticles(dt);

        // Update Eyes Bleed shader time
        if (eyesBleed) eyesBleed.update(clock.getElapsedTime());

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

        // Check player death
        if (gameState.playerHP <= 0 && gameState.state === 'PLAYING') {
            gameState.state = 'LEVEL_COMPLETE';
            document.getElementById('level-complete').style.display = 'flex';
            document.getElementById('level-complete').querySelector('h2').textContent = 'DESTROYED';
            document.exitPointerLock();
            const scoreEl = document.getElementById('final-score');
            if (scoreEl) scoreEl.textContent = `${gameState.oreCollected} / ${gameState.oreTotal}`;
        }
    }

    // Get heading for compass
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const heading = Math.atan2(forward.x, forward.z);

    // Draw HUD
    const gridPos2 = getPlayerGridPos();
    hud.draw({
        grid: gridData?.grid,
        rows: gridData?.rows,
        cols: gridData?.cols,
        playerGridPos: gridPos2,
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
        exitUnlocked: gameState.exitUnlocked,
        // Combat HUD data
        playerHP: gameState.playerHP,
        playerMaxHP: gameState.playerMaxHP,
        gunAmmo: gameState.gunAmmo,
        rocketAmmo: gameState.rocketAmmo,
        damageFlash: gameState.damageFlash,
        enemyPositions: enemyManager ? enemyManager.getEnemyPositions() : [],
        eyesBleedActive: eyesBleed ? eyesBleed.isActive : false
    });

    renderer.render(scene, camera);
}

function applyViewportSize() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const winAspect = winW / winH;

    let vpW, vpH;
    if (winAspect > TARGET_ASPECT) {
        // Window is wider than 16:9 — pillarbox (black bars on sides)
        vpH = winH;
        vpW = Math.floor(winH * TARGET_ASPECT);
    } else {
        // Window is taller than 16:9 — letterbox (black bars top/bottom)
        vpW = winW;
        vpH = Math.floor(winW / TARGET_ASPECT);
    }

    const offsetX = Math.floor((winW - vpW) / 2);
    const offsetY = Math.floor((winH - vpH) / 2);

    // Size and center the renderer canvas
    renderer.setSize(vpW, vpH);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.left = offsetX + 'px';
    renderer.domElement.style.top = offsetY + 'px';

    // Match HUD canvas to the same viewport
    const hudCanvas = document.getElementById('hud-canvas');
    hudCanvas.style.position = 'fixed';
    hudCanvas.style.left = offsetX + 'px';
    hudCanvas.style.top = offsetY + 'px';
    hudCanvas.style.width = vpW + 'px';
    hudCanvas.style.height = vpH + 'px';

    if (hud) hud.resize();
}

function onResize() {
    applyViewportSize();
}

// Start when Three.js is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
