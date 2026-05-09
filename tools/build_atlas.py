#!/usr/bin/env python3
"""
build_atlas.py — Download 1000 SLIME PNGs from IPFS and pack into sprite atlases.

Art atlas:
  - Cell size: 512x512 (16px edge bleed; inner tile content 480x480)
  - Atlas size: 4096x4096 (8x8 grid = 64 slots per sheet, ~16 sheets for 1000)
  - Output: JPEG (q92) fallback + KTX2 UASTC w/ baked mipmaps (preferred)

The bleed extrudes each tile's edge pixels into a 16px gutter so mipmap
generation doesn't blend across tile boundaries on the GPU.

Nameplate atlas:
  - Cell size: 128x24
  - Atlas width: 2048 (16 nameplates per row)
  - Output: PNG (text needs sharp edges) + KTX2 UASTC w/ mipmaps

Outputs:
  - assets/atlas_N.jpg     (fallback)
  - assets/atlas_N.ktx2    (preferred — UASTC + mipmaps)
  - assets/plates_0.png    (fallback)
  - assets/plates_0.ktx2   (preferred)
  - assets/atlas_manifest.json

KTX2 encoding requires toktx (looked up at tools/ktx-bin/toktx.exe).

Usage:
  pip install Pillow requests
  python tools/build_atlas.py                # full rebuild (~15+ min for hires)
  python tools/build_atlas.py --plates-only  # rebuild just the nameplate atlas
"""

import json
import re
import subprocess
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow not installed. Run: pip install Pillow")

try:
    import requests
except ImportError:
    sys.exit("requests not installed. Run: pip install requests")

# --- Art atlas config ---
CELL_SIZE = 256                       # full cell size in atlas (includes bleed)
BLEED = 8                             # replicated edge-pixel gutter per cell side
INNER_TILE = CELL_SIZE - 2 * BLEED    # 480 — actual painted tile area
GRID_SIZE = 8                         # 8x8 = 64 slots per atlas sheet
ATLAS_SIZE = CELL_SIZE * GRID_SIZE    # 4096
JPEG_QUALITY = 92
MAX_TILES = 1000

# --- Per-painting hires (texture-streaming) config ---
HIRES_SIZE = 2048                     # individual KTX2 per painting; ~1.3 MB each
HIRES_WORKERS = 8                     # parallel toktx encodes

# --- Nameplate atlas config ---
# 256x48 cells (was 128x24) — 4x texel density so the pixel font reads crisply
# instead of looking like a low-res scale-up at the gallery viewing distance.
PLATE_W = 256
PLATE_H = 48
PLATE_FONT_PT = 32
PLATE_COLS = 16
PLATE_ATLAS_W = PLATE_COLS * PLATE_W  # 4096

# --- Download config ---
MAX_WORKERS = 20
RETRY_COUNT = 3
TIMEOUT = 30

PROJECT_ROOT = Path(__file__).resolve().parent.parent
URLS_FILE = PROJECT_ROOT / "tools" / "slime_urls.txt"
ASSETS_DIR = PROJECT_ROOT / "assets"
HIRES_DIR = ASSETS_DIR / "hires"
CACHE_DIR = PROJECT_ROOT / "tools" / ".download_cache"
TOKTX_EXE = PROJECT_ROOT / "tools" / "ktx-bin" / "toktx.exe"
WHITE_RABBIT_TTF = PROJECT_ROOT / "tools" / "fonts" / "WHITRABT.ttf"


def extract_urls():
    """Read URLs from slime_urls.txt, return list of (label, url) tuples."""
    if not URLS_FILE.exists():
        sys.exit(f"URL file not found: {URLS_FILE}")

    urls = [line.strip() for line in URLS_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    print(f"Found {len(urls)} URLs in {URLS_FILE.name}")

    result = []
    for url in urls:
        num_match = re.search(r"SLIME(?:%23|%20)(\d+)\.png", url)
        label = f"SLIME #{num_match.group(1)}" if num_match else f"SLIME_unknown_{len(result)}"
        result.append((label, url))

    return result


def download_image(label, url, cache_dir):
    """Download a single image with retries. Returns (label, PIL.Image) or (label, None)."""
    safe_name = re.sub(r'[^\w#]', '_', label) + ".png"
    cache_path = cache_dir / safe_name
    if cache_path.exists():
        try:
            return label, Image.open(cache_path).convert("RGB")
        except Exception:
            cache_path.unlink(missing_ok=True)

    for attempt in range(RETRY_COUNT):
        try:
            gateways = [
                url,
                url.replace("ipfs.io", "cloudflare-ipfs.com"),
                url.replace("ipfs.io", "dweb.link"),
            ]
            gateway_url = gateways[min(attempt, len(gateways) - 1)]
            resp = requests.get(gateway_url, timeout=TIMEOUT)
            resp.raise_for_status()
            cache_path.write_bytes(resp.content)
            img = Image.open(cache_path).convert("RGB")
            return label, img
        except Exception as e:
            if attempt < RETRY_COUNT - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  FAILED: {label} - {e}")
                return label, None


def paste_with_bleed(atlas, tile, slot_x, slot_y):
    """Paste an INNER_TILE-sized tile at slot+(BLEED,BLEED), then extrude its
    edge rows/columns into the BLEED-wide gutter so mipmap generation can't
    pull pixels from neighboring tiles."""
    inner_x = slot_x + BLEED
    inner_y = slot_y + BLEED
    atlas.paste(tile, (inner_x, inner_y))

    w, h = tile.size

    top = tile.crop((0, 0, w, 1)).resize((w, BLEED), Image.NEAREST)
    bottom = tile.crop((0, h - 1, w, h)).resize((w, BLEED), Image.NEAREST)
    left = tile.crop((0, 0, 1, h)).resize((BLEED, h), Image.NEAREST)
    right = tile.crop((w - 1, 0, w, h)).resize((BLEED, h), Image.NEAREST)
    atlas.paste(top, (inner_x, slot_y))
    atlas.paste(bottom, (inner_x, inner_y + h))
    atlas.paste(left, (slot_x, inner_y))
    atlas.paste(right, (inner_x + w, inner_y))

    # Corners — solid blocks of corner pixel color
    tl = tile.getpixel((0, 0))
    tr = tile.getpixel((w - 1, 0))
    bl = tile.getpixel((0, h - 1))
    br = tile.getpixel((w - 1, h - 1))
    atlas.paste(Image.new("RGB", (BLEED, BLEED), tl), (slot_x, slot_y))
    atlas.paste(Image.new("RGB", (BLEED, BLEED), tr), (inner_x + w, slot_y))
    atlas.paste(Image.new("RGB", (BLEED, BLEED), bl), (slot_x, inner_y + h))
    atlas.paste(Image.new("RGB", (BLEED, BLEED), br), (inner_x + w, inner_y + h))


def build_art_atlases(tiles):
    """Pack tiles (each pre-resized to INNER_TILE) into atlas sheets with bleed."""
    slots_per_sheet = GRID_SIZE * GRID_SIZE
    atlases = []
    tile_idx = 0

    while tile_idx < len(tiles):
        atlas_img = Image.new("RGB", (ATLAS_SIZE, ATLAS_SIZE), (10, 10, 20))
        entries = []

        for slot in range(slots_per_sheet):
            if tile_idx >= len(tiles):
                break
            label, img = tiles[tile_idx]
            col = slot % GRID_SIZE
            row = slot // GRID_SIZE
            slot_x = col * CELL_SIZE
            slot_y = (GRID_SIZE - 1 - row) * CELL_SIZE
            paste_with_bleed(atlas_img, img, slot_x, slot_y)
            entries.append({"label": label, "atlas": len(atlases), "col": col, "row": row})
            tile_idx += 1

        atlases.append((atlas_img, entries))

    return atlases


def build_nameplate_atlas(labels):
    """Render all nameplate labels into a single atlas PNG."""
    count = len(labels)
    rows_needed = (count + PLATE_COLS - 1) // PLATE_COLS
    atlas_h = rows_needed * PLATE_H

    atlas_img = Image.new("RGBA", (PLATE_ATLAS_W, atlas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas_img)

    # Prefer White Rabbit (pixel font, looks great at small sizes).
    # Fall back to system monospace fonts if the local TTF is missing.
    font = None
    if WHITE_RABBIT_TTF.exists():
        try:
            font = ImageFont.truetype(str(WHITE_RABBIT_TTF), PLATE_FONT_PT)
        except (IOError, OSError):
            pass
    if font is None:
        for font_name in ["cour.ttf", "courbd.ttf", "consola.ttf", "consolab.ttf",
                           "DejaVuSansMono-Bold.ttf", "LiberationMono-Bold.ttf"]:
            try:
                font = ImageFont.truetype(font_name, PLATE_FONT_PT - 4)
                break
            except (IOError, OSError):
                continue
    if font is None:
        font = ImageFont.load_default()

    entries = {}
    for i, label in enumerate(labels):
        col = i % PLATE_COLS
        row = i // PLATE_COLS
        x = col * PLATE_W
        y = (rows_needed - 1 - row) * PLATE_H

        draw.rectangle([x, y, x + PLATE_W - 1, y + PLATE_H - 1], fill=(26, 16, 8, 255))
        bbox = draw.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = x + (PLATE_W - tw) // 2
        ty = y + (PLATE_H - th) // 2
        draw.text((tx, ty), label, fill=(255, 245, 224, 255), font=font)

        entries[label] = {"col": col, "row": row}

    return atlas_img, rows_needed, entries


def hires_name(label):
    """'SLIME #42' -> 'slime_0042' (zero-padded for sortability)."""
    m = re.search(r'(\d+)', label)
    if m:
        return f"slime_{int(m.group(1)):04d}"
    return re.sub(r'[^\w]', '_', label.lower())


def build_hires_one(label, src_img):
    """Resize source to HIRES_SIZE, write PNG, encode to KTX2, delete PNG.
    Returns (label, relative_path_or_None)."""
    if src_img is None:
        return label, None
    safe = hires_name(label)
    png_path = HIRES_DIR / f"{safe}.png"
    ktx2_path = HIRES_DIR / f"{safe}.ktx2"
    # Hires resolution is independent of CELL_SIZE/BLEED, so re-bakes triggered
    # by atlas-only knob changes don't need to re-encode any of these. toktx
    # encoding dominates total build time — skipping idempotent rewrites turns
    # a ~10 minute rebuild into ~1 minute.
    if ktx2_path.exists():
        return label, f"hires/{safe}.ktx2"
    resized = src_img.resize((HIRES_SIZE, HIRES_SIZE), Image.LANCZOS)
    resized.save(str(png_path), "PNG")
    success = encode_ktx2(png_path, ktx2_path)
    png_path.unlink(missing_ok=True)
    if success:
        return label, f"hires/{safe}.ktx2"
    return label, None


def encode_ktx2(input_path, output_path):
    """Convert PNG/JPG to KTX2 with UASTC + baked mipmaps. Returns True on success."""
    if not TOKTX_EXE.exists():
        return False
    cmd = [
        str(TOKTX_EXE),
        "--t2",
        "--genmipmap",
        # three.js KTX2Loader can't flip block-compressed textures on upload,
        # so the file must already be in bottom-left origin to render upright.
        "--lower_left_maps_to_s0t0",
        "--encode", "uastc",
        "--uastc_quality", "2",
        "--zcmp", "18",
        str(output_path),
        str(input_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"  toktx FAILED for {input_path.name}: {e.stderr.decode(errors='replace')}")
        return False


def rebuild_plates_only():
    """Rebuild just the nameplate atlas + plate fields in the manifest. Reuses
    the existing atlas_manifest.json's tile list, so the art atlas and hires
    files are left untouched. Run after tweaking PLATE_W/H/FONT_PT."""
    manifest_path = ASSETS_DIR / "atlas_manifest.json"
    if not manifest_path.exists():
        sys.exit(f"--plates-only requires {manifest_path} (run a full build first)")

    existing = json.loads(manifest_path.read_text(encoding="utf-8"))
    # Preserve original tile order so plateCol/plateRow stay aligned with
    # whatever ordering the tiles dict has on disk.
    labels = list(existing["tiles"].keys())
    print(f"Rebuilding nameplate atlas for {len(labels)} labels "
          f"({PLATE_W}x{PLATE_H} cells, {PLATE_FONT_PT}pt font)...")

    plate_img, plate_rows, plate_entries = build_nameplate_atlas(labels)
    plate_path = ASSETS_DIR / "plates_0.png"
    plate_img.save(str(plate_path), "PNG")
    size_kb = plate_path.stat().st_size / 1024
    print(f"  {plate_path.name}: {size_kb:.0f} KB ({len(plate_entries)} nameplates, {PLATE_COLS}x{plate_rows})")

    if TOKTX_EXE.exists():
        plate_ktx2 = ASSETS_DIR / "plates_0.ktx2"
        if encode_ktx2(plate_path, plate_ktx2):
            ktx2_kb = plate_ktx2.stat().st_size / 1024
            print(f"  {plate_ktx2.name}: {ktx2_kb:.0f} KB (UASTC + mipmaps)")

    existing["plate"] = {
        "cellWidth": PLATE_W,
        "cellHeight": PLATE_H,
        "cols": PLATE_COLS,
        "rows": plate_rows,
        "atlasWidth": PLATE_ATLAS_W,
        "atlasHeight": plate_rows * PLATE_H,
    }
    for label in labels:
        plate = plate_entries[label]
        existing["tiles"][label]["plateCol"] = plate["col"]
        existing["tiles"][label]["plateRow"] = plate["row"]

    manifest_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    print(f"  Manifest: {manifest_path.name} updated")
    print("\nDone! Bump the ASSET_VER in gallery.js so browsers don't serve a cached plate.")


def main():
    if "--plates-only" in sys.argv:
        rebuild_plates_only()
        return

    ASSETS_DIR.mkdir(exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Extract URLs (capped to MAX_TILES)
    url_list = extract_urls()[:MAX_TILES]
    print(f"Using {len(url_list)} tiles (capped at {MAX_TILES})")

    # 2. Download in parallel
    print(f"Downloading {len(url_list)} images (cached in {CACHE_DIR})...")
    downloaded = [None] * len(url_list)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(download_image, label, url, CACHE_DIR): i
                   for i, (label, url) in enumerate(url_list)}
        done_count = 0
        for fut in as_completed(futures):
            idx = futures[fut]
            label, src_img = fut.result()
            if src_img is not None:
                atlas_tile = src_img.resize((INNER_TILE, INNER_TILE), Image.LANCZOS)
                downloaded[idx] = (label, atlas_tile, src_img)
            else:
                placeholder = Image.new("RGB", (INNER_TILE, INNER_TILE), (26, 26, 46))
                downloaded[idx] = (label, placeholder, None)
            done_count += 1
            if done_count % 50 == 0 or done_count == len(url_list):
                print(f"  {done_count}/{len(url_list)} downloaded")

    tiles = [(label, atlas_tile) for label, atlas_tile, _ in downloaded if atlas_tile is not None]
    print(f"Packing {len(tiles)} tiles into art atlases "
          f"({CELL_SIZE}px cells, {BLEED}px bleed, {INNER_TILE}px content)...")

    # 3. Build art atlases
    art_atlases = build_art_atlases(tiles)
    all_art_entries = []
    have_toktx = TOKTX_EXE.exists()
    if not have_toktx:
        print(f"  WARNING: {TOKTX_EXE} not found - skipping KTX2 encoding")

    for i, (art_img, entries) in enumerate(art_atlases):
        # JPEG fallback
        jpg_path = ASSETS_DIR / f"atlas_{i}.jpg"
        art_img.save(str(jpg_path), "JPEG", quality=JPEG_QUALITY)
        size_mb = jpg_path.stat().st_size / (1024 * 1024)
        print(f"  {jpg_path.name}: {size_mb:.1f} MB ({len(entries)} tiles)")

        # KTX2 (preferred) — encode from a temporary lossless PNG
        if have_toktx:
            png_tmp = ASSETS_DIR / f"atlas_{i}.png"
            art_img.save(str(png_tmp), "PNG")
            ktx2_path = ASSETS_DIR / f"atlas_{i}.ktx2"
            if encode_ktx2(png_tmp, ktx2_path):
                ktx2_mb = ktx2_path.stat().st_size / (1024 * 1024)
                print(f"  {ktx2_path.name}: {ktx2_mb:.1f} MB (UASTC + mipmaps)")
            png_tmp.unlink(missing_ok=True)

        all_art_entries.extend(entries)

    # Remove stale atlas sheets beyond what we generated
    for i in range(len(art_atlases), 32):
        for ext in ('jpg', 'ktx2', 'png'):
            old = ASSETS_DIR / f"atlas_{i}.{ext}"
            if old.exists():
                old.unlink()
                print(f"  Removed old {old.name}")

    # 4. Build nameplate atlas
    labels = [entry["label"] for entry in all_art_entries]
    print(f"Building nameplate atlas for {len(labels)} labels...")
    plate_img, plate_rows, plate_entries = build_nameplate_atlas(labels)
    plate_path = ASSETS_DIR / "plates_0.png"
    plate_img.save(str(plate_path), "PNG")
    size_kb = plate_path.stat().st_size / 1024
    print(f"  {plate_path.name}: {size_kb:.0f} KB ({len(plate_entries)} nameplates, {PLATE_COLS}x{plate_rows})")

    if have_toktx:
        plate_ktx2 = ASSETS_DIR / "plates_0.ktx2"
        if encode_ktx2(plate_path, plate_ktx2):
            ktx2_kb = plate_ktx2.stat().st_size / 1024
            print(f"  {plate_ktx2.name}: {ktx2_kb:.0f} KB (UASTC + mipmaps)")

    # 5. Per-painting hires textures (lazy-loaded by gallery.js when player is close)
    hires_files = {}
    if have_toktx:
        HIRES_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Generating {len(downloaded)} hires textures ({HIRES_SIZE}px, {HIRES_WORKERS} workers)...")

        with ThreadPoolExecutor(max_workers=HIRES_WORKERS) as pool:
            futs = {pool.submit(build_hires_one, label, src): label
                    for label, _, src in downloaded}
            done = 0
            for fut in as_completed(futs):
                label, rel_path = fut.result()
                if rel_path:
                    hires_files[label] = rel_path
                done += 1
                if done % 50 == 0 or done == len(downloaded):
                    print(f"  {done}/{len(downloaded)} encoded")

        # Drop stale files from previous runs
        keep = {Path(p).name for p in hires_files.values()}
        removed = 0
        for f in HIRES_DIR.glob("*.ktx2"):
            if f.name not in keep:
                f.unlink()
                removed += 1
        if removed:
            print(f"  Removed {removed} stale hires files")

        total_mb = sum((HIRES_DIR / Path(p).name).stat().st_size for p in hires_files.values()) / (1024 * 1024)
        print(f"  {len(hires_files)} hires files written ({total_mb:.0f} MB total on disk)")
    else:
        print(f"Skipping hires generation (toktx not found)")

    # 6. Manifest — uses entry["atlas"] (was hardcoded to 0, dropping 75% of art)
    manifest = {
        "cellSize": CELL_SIZE,
        "tileSize": CELL_SIZE,           # legacy alias
        "innerTileSize": INNER_TILE,
        "bleed": BLEED,
        "gridSize": GRID_SIZE,
        "atlasSize": ATLAS_SIZE,
        "atlasCount": len(art_atlases),
        "plate": {
            "cellWidth": PLATE_W,
            "cellHeight": PLATE_H,
            "cols": PLATE_COLS,
            "rows": plate_rows,
            "atlasWidth": PLATE_ATLAS_W,
            "atlasHeight": plate_rows * PLATE_H,
        },
        "tiles": {},
    }

    for entry in all_art_entries:
        label = entry["label"]
        plate = plate_entries[label]
        manifest["tiles"][label] = {
            "atlas": entry["atlas"],
            "col": entry["col"],
            "row": entry["row"],
            "plateCol": plate["col"],
            "plateRow": plate["row"],
            "hiresFile": hires_files.get(label),
        }

    manifest_path = ASSETS_DIR / "atlas_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"  Manifest: {manifest_path.name} ({len(manifest['tiles'])} tiles)")

    print("\nDone! Atlas files written to assets/")


if __name__ == "__main__":
    main()
