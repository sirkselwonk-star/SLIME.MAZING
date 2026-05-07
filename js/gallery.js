// gallery.js — SLIME.GALLERY NFT artwork on maze walls (sprite atlas version)

import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// Module-level state — persists across level restarts
let atlasTextures = null;   // Array of THREE.Texture (one per art atlas sheet)
let plateTexture = null;    // Single THREE.Texture for nameplate atlas
let manifest = null;        // { tileSize, gridSize, atlasCount, plate, tiles }
let ktx2Supported = null;   // null = untested, true/false after first load

// Shared geometry/material — created once
let sharedFrameGeo, sharedArtGeo, sharedPlateGeo, sharedFrameMat;

function ensureSharedResources(THREE) {
    if (!sharedFrameGeo) {
        sharedFrameGeo = new THREE.PlaneGeometry(1.6, 1.6);
        sharedArtGeo = new THREE.PlaneGeometry(1.4, 1.4);
        sharedPlateGeo = new THREE.PlaneGeometry(0.9, 0.14);
        sharedFrameMat = new THREE.MeshStandardMaterial({
            color: 0x1a1008, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide
        });
    }
}

/**
 * Load a texture, trying KTX2 first with JPEG/PNG fallback.
 * Mipmaps + anisotropy are enabled — atlases must have edge bleed to avoid
 * cross-tile color smearing at lower mip levels (see build_atlas.py).
 */
function loadTexture(path, THREE, renderer) {
    const ktx2Path = path.replace(/\.(jpg|png)$/, '.ktx2');
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    if (ktx2Supported === false) {
        return loadWithTextureLoader(path, THREE, maxAniso);
    }

    const ktx2Loader = new KTX2Loader()
        .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/libs/basis/')
        .detectSupport(renderer);

    return new Promise((resolve) => {
        ktx2Loader.load(
            ktx2Path,
            (tex) => {
                ktx2Supported = true;
                tex.colorSpace = THREE.SRGBColorSpace;
                // KTX2 carries pre-baked mipmaps from toktx --genmipmap; don't regenerate.
                tex.generateMipmaps = false;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.anisotropy = maxAniso;
                ktx2Loader.dispose();
                resolve(tex);
            },
            undefined,
            () => {
                // KTX2 failed — fall back to JPEG/PNG
                ktx2Supported = false;
                ktx2Loader.dispose();
                loadWithTextureLoader(path, THREE, maxAniso).then(resolve);
            }
        );
    });
}

function loadWithTextureLoader(path, THREE, maxAniso) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
            path,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.anisotropy = maxAniso || 1;
                resolve(tex);
            },
            undefined,
            reject
        );
    });
}

/**
 * Load atlas textures and manifest. Caches across level restarts.
 */
function loadAtlasAssets(THREE, renderer, onProgress) {
    if (atlasTextures && plateTexture && manifest) {
        const total = (atlasTextures.length || 2) + 2;
        if (onProgress) onProgress(total, total);
        return Promise.resolve();
    }

    // First load manifest to know how many art atlases exist
    return fetch('assets/atlas_manifest.json')
        .then(r => r.json())
        .then(manifestData => {
            manifest = manifestData;
            const artCount = manifest.atlasCount;
            const total = artCount + 2; // art sheets + plate sheet + manifest
            let loaded = 1; // manifest already loaded
            if (onProgress) onProgress(loaded, total);
            const report = () => { loaded++; if (onProgress) onProgress(loaded, total); };

            const artPromises = [];
            for (let i = 0; i < artCount; i++) {
                artPromises.push(
                    loadTexture(`assets/atlas_${i}.jpg`, THREE, renderer).then(tex => { report(); return tex; })
                );
            }

            const platePromise = loadTexture('assets/plates_0.png', THREE, renderer).then(tex => { report(); return tex; });

            return Promise.all([Promise.all(artPromises), platePromise]);
        })
        .then(([artTextures, plateTex]) => {
            atlasTextures = artTextures;
            plateTexture = plateTex;
        });
}

export class GalleryManager {
    constructor() {
        this.paintings = [];
        this._disposed = false;
    }

    /**
     * @param {object} wallMeshes
     * @param {THREE} THREE
     * @param {WebGLRenderer} renderer — needed for KTX2 format detection
     * @param {function} onProgress
     * @param {THREE.Scene} scene — frame InstancedMesh is added at scene level
     */
    placeArtwork(wallMeshes, THREE, renderer, onProgress, scene) {
        this._disposed = false;
        this._THREE = THREE;
        this._wallMeshes = wallMeshes;
        this._hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        ensureSharedResources(THREE);

        return loadAtlasAssets(THREE, renderer, onProgress).then(() => {
            if (this._disposed) return;

            const tileNames = Object.keys(manifest.tiles);
            const keys = Object.keys(wallMeshes);

            // Shuffle wall keys
            for (let i = keys.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [keys[i], keys[j]] = [keys[j], keys[i]];
            }

            // Shuffle tile names
            const shuffledTiles = [...tileNames];
            for (let i = shuffledTiles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledTiles[i], shuffledTiles[j]] = [shuffledTiles[j], shuffledTiles[i]];
            }

            const count = Math.min(keys.length, shuffledTiles.length);

            // Atlas UV — supports edge-bleed atlases. Old manifests without
            // bleed/innerTileSize collapse to the original (col*1/grid) math.
            const atlasSize = manifest.atlasSize;
            const cellSize = manifest.cellSize || manifest.tileSize;
            const bleed = manifest.bleed || 0;
            const innerTileSize = manifest.innerTileSize || (cellSize - 2 * bleed);
            const uvScale = innerTileSize / atlasSize;
            const cellStep = cellSize / atlasSize;
            const innerOffsetUV = bleed / atlasSize;

            const invPlateCols = 1 / manifest.plate.cols;
            const invPlateRows = 1 / manifest.plate.rows;

            // Hires streaming infra (per-painting 2048² textures lazy-loaded
            // when player is close). Only viable when KTX2 is supported.
            this._hiresCache = new Map();          // label -> { texture, lastAccess }
            this._hiresLoading = new Set();        // labels currently being fetched
            this._hiresActiveLabels = new Set();   // labels currently swapped into a material
            this._hiresCacheMax = 32;
            this._maxAniso = renderer.capabilities.getMaxAnisotropy();
            if (ktx2Supported !== false) {
                this._hiresLoader = new KTX2Loader()
                    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/libs/basis/')
                    .detectSupport(renderer);
            }

            // Single InstancedMesh for all frames — collapses ~1000 draws into 1.
            // frustumCulled=false because instances span the whole maze; the
            // default per-mesh bounds would mis-cull on narrow corridor views.
            this.frameMesh = new THREE.InstancedMesh(sharedFrameGeo, sharedFrameMat, count);
            this.frameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.frameMesh.frustumCulled = false;
            if (scene) scene.add(this.frameMesh);

            const tmpMat = new THREE.Matrix4();
            const tmpPos = new THREE.Vector3();
            const tmpQuat = new THREE.Quaternion();
            const tmpScale = new THREE.Vector3(1, 1, 1);
            const yAxis = new THREE.Vector3(0, 1, 0);

            for (let i = 0; i < count; i++) {
                const key = keys[i];
                const wall = wallMeshes[key];
                const dir = key.split(',')[2];
                const label = shuffledTiles[i];
                const tile = manifest.tiles[label];

                // Direction-based local placement (relative to wall center).
                // ly=0.1 raises center from wall midpoint (1.5m) to 1.6m so
                // paintings sit slightly above eye height — hero framing.
                let lx = 0, ly = 0.1, lz = 0, yRot = 0;
                if (dir === 'N') { lz = 0.16; }
                else if (dir === 'S') { lz = -0.16; yRot = Math.PI; }
                else if (dir === 'W') { lx = 0.16; yRot = Math.PI / 2; }
                else if (dir === 'E') { lx = -0.16; yRot = -Math.PI / 2; }

                // Frame instance matrix (world space — walls have no rotation)
                tmpPos.set(wall.position.x + lx, wall.position.y + ly, wall.position.z + lz);
                tmpQuat.setFromAxisAngle(yAxis, yRot);
                tmpMat.compose(tmpPos, tmpQuat, tmpScale);
                this.frameMesh.setMatrixAt(i, tmpMat);
                const savedFrameMatrix = tmpMat.clone();

                // Art + plate stay parented to wall so wall destruction
                // automatically hides them via the visibility cascade.
                const group = new THREE.Group();
                group.position.set(lx, ly, lz);
                group.rotation.y = yRot;

                const artTex = atlasTextures[tile.atlas].clone();
                artTex.needsUpdate = true;
                artTex.repeat.set(uvScale, uvScale);
                artTex.offset.set(
                    tile.col * cellStep + innerOffsetUV,
                    tile.row * cellStep + innerOffsetUV
                );
                const artMat = new THREE.MeshStandardMaterial({
                    map: artTex,
                    roughness: 0.5,
                    metalness: 0.0,
                    side: THREE.DoubleSide
                });
                const art = new THREE.Mesh(sharedArtGeo, artMat);
                art.position.z = 0.01;
                group.add(art);

                const pTex = plateTexture.clone();
                pTex.needsUpdate = true;
                pTex.repeat.set(invPlateCols, invPlateRows);
                pTex.offset.set(tile.plateCol * invPlateCols, tile.plateRow * invPlateRows);
                const plateMat = new THREE.MeshBasicMaterial({
                    map: pTex, side: THREE.DoubleSide, transparent: true
                });
                const plate = new THREE.Mesh(sharedPlateGeo, plateMat);
                plate.position.set(0, -0.92, 0.05);
                group.add(plate);

                wall.add(group);

                this.paintings.push({
                    group, artMat, plateMat, artTex, pTex, label,
                    artMesh: art, plateMesh: plate,
                    wallKey: key, frameIndex: i,
                    savedFrameMatrix, frameVisible: true,
                    atlasMap: artTex,           // kept for swap-back when hires unloads
                    hiresFile: tile.hiresFile,  // null if encoding failed
                    hiresActive: false
                });
            }

            this.frameMesh.instanceMatrix.needsUpdate = true;
        });
    }

    /**
     * Per-frame: distance-cull plates and art, sync frame instance visibility
     * with wall destruction, and stream high-res textures for nearby paintings.
     */
    update(camera) {
        if (!this.paintings.length || !this.frameMesh) return;

        const camPos = camera.position;
        const PLATE_CULL_SQ = 100;     // 10m
        const ART_CULL_SQ = 900;       // 30m
        const HIRES_USE_SQ = 25;       // 5m — swap to hires when within
        const HIRES_DROP_SQ = 36;      // 6m — swap back to atlas when beyond (hysteresis)
        const now = performance.now();

        let frameDirty = false;

        for (let i = 0; i < this.paintings.length; i++) {
            const p = this.paintings[i];
            if (!p.worldPos) continue;

            const dx = p.worldPos.x - camPos.x;
            const dz = p.worldPos.z - camPos.z;
            const dist2 = dx * dx + dz * dz;

            if (p.plateMesh) p.plateMesh.visible = dist2 < PLATE_CULL_SQ;
            if (p.artMesh) p.artMesh.visible = dist2 < ART_CULL_SQ;

            const wall = this._wallMeshes[p.wallKey];
            const wallVisible = wall ? wall.visible : false;
            if (wallVisible !== p.frameVisible) {
                this.frameMesh.setMatrixAt(i, wallVisible ? p.savedFrameMatrix : this._hideMatrix);
                p.frameVisible = wallVisible;
                frameDirty = true;
            }

            if (wallVisible && this._hiresLoader && p.hiresFile) {
                if (dist2 < HIRES_USE_SQ) {
                    this._touchHires(p, now);
                } else if (dist2 > HIRES_DROP_SQ && p.hiresActive) {
                    this._revertToAtlas(p);
                }
            }
        }

        if (frameDirty) this.frameMesh.instanceMatrix.needsUpdate = true;

        if (this._hiresCache && this._hiresCache.size > this._hiresCacheMax) {
            this._evictLRU();
        }
    }

    _touchHires(p, now) {
        const cached = this._hiresCache.get(p.label);
        if (cached) {
            cached.lastAccess = now;
            if (!p.hiresActive) {
                p.artMat.map = cached.texture;
                p.artMat.needsUpdate = true;
                p.hiresActive = true;
                this._hiresActiveLabels.add(p.label);
            }
        } else if (!this._hiresLoading.has(p.label)) {
            this._loadHires(p);
        }
    }

    _loadHires(p) {
        this._hiresLoading.add(p.label);
        this._hiresLoader.load(
            'assets/' + p.hiresFile,
            (tex) => {
                this._hiresLoading.delete(p.label);
                if (this._disposed) { tex.dispose(); return; }
                tex.colorSpace = this._THREE.SRGBColorSpace;
                tex.generateMipmaps = false;
                tex.minFilter = this._THREE.LinearMipmapLinearFilter;
                tex.magFilter = this._THREE.LinearFilter;
                tex.anisotropy = this._maxAniso || 1;
                this._hiresCache.set(p.label, { texture: tex, lastAccess: performance.now() });
            },
            undefined,
            () => {
                this._hiresLoading.delete(p.label);
            }
        );
    }

    _revertToAtlas(p) {
        p.artMat.map = p.atlasMap;
        p.artMat.needsUpdate = true;
        p.hiresActive = false;
        this._hiresActiveLabels.delete(p.label);
    }

    _evictLRU() {
        const candidates = [];
        for (const [label, entry] of this._hiresCache.entries()) {
            if (!this._hiresActiveLabels.has(label)) {
                candidates.push({ label, lastAccess: entry.lastAccess });
            }
        }
        candidates.sort((a, b) => a.lastAccess - b.lastAccess);
        while (this._hiresCache.size > this._hiresCacheMax && candidates.length) {
            const { label } = candidates.shift();
            const entry = this._hiresCache.get(label);
            if (entry) {
                entry.texture.dispose();
                this._hiresCache.delete(label);
            }
        }
    }

    cacheWorldPositions() {
        const pos = new THREE.Vector3();
        for (const p of this.paintings) {
            p.group.getWorldPosition(pos);
            p.worldPos = pos.clone();
        }
    }

    cleanup() {
        this._disposed = true;
        if (this.frameMesh) {
            if (this.frameMesh.parent) this.frameMesh.parent.remove(this.frameMesh);
            this.frameMesh.dispose();
            this.frameMesh = null;
        }
        if (this._hiresLoader) {
            this._hiresLoader.dispose();
            this._hiresLoader = null;
        }
        if (this._hiresCache) {
            for (const entry of this._hiresCache.values()) {
                entry.texture.dispose();
            }
            this._hiresCache.clear();
        }
        if (this._hiresActiveLabels) this._hiresActiveLabels.clear();
        if (this._hiresLoading) this._hiresLoading.clear();
        for (const p of this.paintings) {
            if (p.group.parent) p.group.parent.remove(p.group);
            p.artTex.dispose();
            p.pTex.dispose();
            p.artMat.dispose();
            p.plateMat.dispose();
        }
        this.paintings = [];
    }
}
