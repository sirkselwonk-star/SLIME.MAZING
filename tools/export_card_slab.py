"""Export SLIME_CardHolder.blend to assets/card_slab.glb.

Run via:
  blender SLIME_CardHolder.blend --background --python export_card_slab.py
"""
import bpy
from pathlib import Path

OUT = Path(r"C:\PROJECTS\SLIME\SLIME.MAZING\assets\card_slab.glb")
OUT.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format='GLB',
    export_apply=True,        # bake modifiers into mesh data
    export_yup=True,          # three.js convention
    export_animations=False,
    export_lights=False,
    export_cameras=False,
    use_selection=False,      # export everything
)

size_kb = OUT.stat().st_size / 1024
print(f"WROTE: {OUT}  ({size_kb:.1f} KB)")
