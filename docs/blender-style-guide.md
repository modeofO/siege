# Blender Style Guide — Siege Dojo Sprites

Reference for rendering props for the Siege Dojo frontend. Captures the camera rig, lighting recipe, material node graphs, and specific parameters used across the desk, citadel, gates, resource nodes, and the spellbook sprites. Read this before starting any new Blender asset so the aesthetic stays consistent.

## Asset Inventory (as of 2026-08-03)

| Sprite | Path | Purpose |
|---|---|---|
| Desk (wood planks) | `frontend/public/sprites/desk_preview.png` | Full-viewport background (via `body { background-image }`) |
| Citadel | `frontend/public/sprites/citadel.png` | Match page player/enemy fortress icons |
| East Gate | `frontend/public/sprites/gate-east.png` | Battlefield panel |
| West Gate | `frontend/public/sprites/gate-west.png` | Battlefield panel |
| Underground Gate | `frontend/public/sprites/gate-underground.png` | Battlefield panel |
| Forge node | `frontend/public/sprites/node-forge.png` | Resource node icon |
| Quarry node | `frontend/public/sprites/node-quarry.png` | Resource node icon |
| Grove node | `frontend/public/sprites/node-grove.png` | Resource node icon |
| Book (closed) | `frontend/public/sprites/book_preview.png` | Fixed corner element linking to `/craft` |
| Book (half open) | `frontend/public/sprites/book_half.png` | Mid-frame of the open animation |
| Book (open) | `frontend/public/sprites/book_open.png` | `/craft` page background |
| Battlefield | `frontend/public/sprites/battlefield.png` | 16:9 backdrop in `BattlefieldView` |
| Battlefield (old) | `frontend/public/sprites/battlefield_old.png` | Unreferenced — superseded by `battlefield.png` |
| Battlefield (render) | `frontend/public/sprites/battlefield_render.png` | Unreferenced — superseded by `battlefield.png` |
| Compass | `frontend/public/sprites/compass.png` | `CompassLink` to the docs site |
| Parchment map | `frontend/public/sprites/parchment-map.png` | Hex-grid frame on `/world` (The Marches) |
| Torch sconce | `frontend/public/sprites/torch-sconce.png` | Torch overlays on the parchment frame |
| Ability icons | `frontend/public/sprites/abilities/*.svg` | Five ability icons; `siege-sword.svg` is the favicon (SVGs, not Blender renders) |
| Troops | `frontend/public/sprites/troops/troop_*.png` | Battle-animation troop sprites: attack/defense/healer/node × teams a/b |

## Core Aesthetic

Everything targets a **medieval war-room tactical map** feel. Dark, warm, tactile. Nothing neon, nothing cartoon-flat, nothing shiny.

**Global palette (approx, linear color values):**
- Deep warm brown shadows: `(0.015, 0.009, 0.009)` — leather/wood deep cracks, cool shadow tint
- Mid-tone warm brown: `(0.04, 0.018, 0.008)` — dominant wood/leather value
- Warm highlight brown: `(0.09 – 0.11, 0.04 – 0.05, 0.015 – 0.022)` — brightest warm highlights
- Aged brass mid: `(0.48, 0.30, 0.10)` — brass clasps, corners, title letters
- Aged brass bright: `(0.75, 0.52, 0.18)` — polished brass highlights where worn smooth
- Brass tarnish: `(0.22, 0.14, 0.04)` — recessed/shaded brass
- Parchment dark: `(0.72, 0.62, 0.44)` — aged/shaded page areas
- Parchment bright: `(0.92, 0.84, 0.65)` — clean page highlights
- Ink/handwriting color: `#3b2410 – #5a3b1e` (sRGB) — used for text rendered on parchment in the browser

All textures tend dark. AgX Medium High Contrast color management is applied (`view_settings.look = 'AgX - Medium High Contrast'`).

## Scene Structure Pattern

The project uses **one long-lived Blender scene** with every asset co-existing in its own collection at an offset location. This lets us re-render any asset without rebuilding, and compose side-by-side without interfering.

**Offset convention:**
```
Desk       → origin (0, 0, 0)
Closed book → (100, 100, 0)
Open book   → (200, 100, 0)
Half-open   → (300, 100, 0)
(new assets go at +100 X offsets from the last one)
```

**Collection naming:** `Desk`, `Book`, `OpenBook`, `HalfBook`, etc. Each asset has its own camera + lights parented into the same collection, named like `BookCam`, `OpenCam`, `HalfCam`, `BookKey`, `BookFill`, `BookRim`.

Switch renders via `bpy.context.scene.camera = bpy.data.objects["BookCam"]`. Output paths are hardcoded per-asset; never share a filepath between cameras.

## Camera Rig

**Always orthographic.** Perspective projection introduces foreshortening that fights the isometric/tactical feel.

**Standard angle: 28° tilt from vertical** (closed book, desk, most props). This matches a relaxed "looking down at the table" view with enough depth to read 3D form but enough top-down to keep the silhouette clean.

**Exceptions:**
- Desk uses 0° (pure top-down) since it's the background plane
- Open book uses 32° tilt — slightly steeper to make the two-page spread read more clearly
- Half-open book uses 28° (matches closed book so the animation reads as one continuous object)

**Camera placement formula (Python):**
```python
CAM_DIST = 6.5        # distance from subject along view axis
CAM_TILT_DEG = 28
tilt = math.radians(CAM_TILT_DEG)
cam_x = 0
cam_y = -math.sin(tilt) * CAM_DIST
cam_z = math.cos(tilt) * CAM_DIST

bpy.ops.object.camera_add(
    location=(cam_x + ORIGIN[0], cam_y + ORIGIN[1], cam_z + 0.4 + ORIGIN[2])
)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 4.2   # tune per asset
cam.rotation_euler = (tilt, 0, 0)
```

**Ortho scale per asset:**
- Closed book: 4.2
- Half-open book: 5.2 (cover standing up needs more vertical room)
- Open book: 7.8 (wider spread)
- Desk: 22.0 (viewport-filling, overflows camera frame)

## Lighting Recipe

**3-point rig, always:** warm key, cool fill, warm rim. All area lights. Positioned relative to the asset's origin in the same local frame every time.

```python
# KEY — warm, upper-left of subject, strongest
bpy.ops.object.light_add(type='AREA', location=(-2, -1, 5) + ORIGIN)
key.data.size = 4
key.data.energy = 400        # scale up proportionally for larger assets
key.data.color = (1.0, 0.85, 0.65)   # warm tungsten
key.rotation_euler = (radians(-15), radians(-20), 0)

# FILL — cool, opposite side, softer
bpy.ops.object.light_add(type='AREA', location=(3, 2, 4) + ORIGIN)
fill.data.size = 5
fill.data.energy = 120       # ~30% of key
fill.data.color = (0.75, 0.85, 1.0)   # cool daylight
fill.rotation_euler = (radians(25), radians(20), 0)

# RIM — warm, behind subject, picks out top edge
bpy.ops.object.light_add(type='AREA', location=(0, 4, 3) + ORIGIN)
rim.data.size = 3
rim.data.energy = 200
rim.data.color = (1.0, 0.75, 0.45)   # warm amber
```

**Scale lights to asset size.** When the desk was rebuilt at 2× size, light positions needed to scale too — leaving the original rim light at `(0, 6, 5)` while the desk grew from 12 to 24 units caused a bright plank-shaped hot spot over the plank closest to the rim light's center.

**Energy values assume ~1–5m subject.** For the desk (20+ unit subject), key energy goes to ~8000, fill to ~2500, rim to ~400, and area light sizes scale 4× (key goes from 4 to 18).

## Render Settings

```python
scene.render.engine = 'BLENDER_EEVEE'   # the enum is still named BLENDER_EEVEE in this Blender version, not BLENDER_EEVEE_NEXT
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.film_transparent = True    # for sprite compositing
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

scene.eevee.taa_render_samples = 128
scene.eevee.use_gtao = True
scene.eevee.use_bloom = False            # IMPORTANT: bloom on creates hot edges in narrow gaps

scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.0 to 0.5  # tune per asset
```

**Resolution per asset:**
- Background prop (desk): 1024×1024
- Icon-sized props (gates, nodes): 2048×2048
- Open book: 1600×1024 (widescreen for the 2-page spread)
- Half-open book: 1200×1024

**Always RGBA + transparent background** for props that overlay other sprites.

## Material Library

### Dark Oak Wood (`WoodPlank_XX`)

For the desk. Per-plank material instances so each plank looks slightly different via mapping offset.

**Key nodes:**
- Texture Coordinate → Mapping with `Scale=(2.5, 35.0, 1.0)` (grain stretched horizontally along plank length)
- Use **Generated** output, not Object, for coords — consistent regardless of plank scale
- Wave texture: `BANDS`, direction `Y`, `Distortion=12.0`, `Detail=12.0` — the grain lines
- Noise texture (fiber): `Scale=3.0`, `Detail=15.0`, `Distortion=2.0` — background character
- Mix the wave and noise at factor 0.65 (favor noise to prevent any single plank landing on a wave hotspot)
- ColorRamp (EASE interpolation) with 4 stops:
  - 0.15: `(0.015, 0.009, 0.009)` — near black, slight cool tint
  - 0.45: `(0.035, 0.017, 0.012)` — shadow mid
  - 0.70: `(0.060, 0.025, 0.010)` — mid
  - 0.90: `(0.115, 0.050, 0.022)` — warm highlight
- Roughness: **0.986** (very matte — leather/worn wood look)
- Bump strength: 0.5, distance: 0.15

**Gotcha:** Per-plank mapping needs different XYZ offsets, including non-zero Z, to sample different regions of the 3D noise volume. Using Z=0 everywhere caused all planks to look similar.

### Dark Beaten Leather (`Book_Leather`)

Used on book covers and spine. The most complex material — four layers of tonal and textural variation.

**Structure:**
1. **Big noise (Scale=1.5, Detail=4, Distortion=0.8)** — large tonal wandering
2. **Medium noise (Scale=6, Detail=10, Distortion=1.2)** — mid-scale variation
3. Mix layers 1 and 2 at factor 0.35 → feeds a ColorRamp:
   - 0.2: `(0.015, 0.009, 0.009)` — cool-tinted shadow (temperature shift)
   - 0.55: `(0.035, 0.017, 0.012)`
   - 0.85: `(0.09, 0.034, 0.011)` — warm highlight (temperature shift)
4. **Edge darkening:** Separate XYZ from Generated coord → `abs(2*v - 1)` per axis → `max(x_edge, y_edge)` → `pow(6)` → EASE ramp multiplied into base color. Darkens corners/edges where oils accumulate from handling.
5. **Roughness variation:** same big-noise drives a ramp from 0.7 (slightly polished worn spots) to 0.92 (matte).

**Bump stack (in order):**
1. Main bump: mix of pore noise (Scale=80, high-freq) and grain noise (Scale=25, mid-freq), strength 0.5, distance 0.015
2. Directional crease bump chained on top: stretched mapping `Scale=(18, 1.5, 2.0)` + noise → subtle vertical grooves suggesting hide direction, strength 0.25

**DO NOT USE Voronoi for color variation on leather.** It creates cell-shaped blob spots that read as painted stains. Voronoi is fine for bump or for masking but never for color mixing on organic surfaces.

### Aged Brass (`Book_Brass`)

Clasps, corner reinforcements, title letters, cartouche bars.

```python
bsdf.inputs['Metallic'].default_value = 1.0

# Single noise for patina variation
patina_noise: Scale=4.0, Detail=10, Roughness=0.7

# Color ramp driven by noise:
# 0.25 → (0.22, 0.14, 0.04)  — dark tarnish
# 0.60 → (0.48, 0.30, 0.10)  — mid brass
# 0.85 → (0.75, 0.52, 0.18)  — bright worn brass

# Roughness ramp from same noise:
# low: 0.25 (polished worn spots)
# high: 0.55 (tarnished areas)

# Subtle bump from same noise: strength 0.2, distance 0.01
```

Shared between all brass parts via `mat.copy()` rather than recreating the graph.

### Parchment (two variants)

**`Book_Pages_Mat` (striated edge view):** For the *stack* of pages visible at the book's edge block. Dense `Z`-axis wave texture with `SAW` profile at scale 80 creates horizontal page-edge lines. Color ramp: `(0.45, 0.35, 0.22)` → `(0.85, 0.72, 0.48)`. Strong bump from the wave (strength 0.8) makes the page lines pop.

**`Book_OpenPages` (clean top page):** For the flat sheets you see when the book is open. High-frequency paper noise at Scale=120 for grain + low-frequency stain noise at Scale=2.5. Color ramp: `(0.72, 0.62, 0.44)` → `(0.92, 0.84, 0.65)`. Bump strength 0.25, very subtle.

### Iron Nails (`NailIron`)

Brass-cousin material for nail heads on the desk.
- Base Color: `(0.04, 0.035, 0.03)` — near-black iron
- Metallic: 0.85
- Roughness: noise-driven, range 0.6 – 0.95
- Fine bump from high-frequency noise, strength 0.4

### Ruby Gem

**Note:** The ruby gem was removed by request (no occult imagery). Keeping this recipe as reference only — do not use on book covers.

## Build Patterns

### Texture Coordinates — Object vs Generated

**Use Object coords when:** You need a truly uniform texture space regardless of the mesh's bounding box shape. Object coords = the mesh's local vertex positions, unscaled.

**Use Generated coords when:** You want the texture to stretch across the bounding box (fills 0..1 on each axis regardless of the mesh's actual dimensions).

**Key pitfall:** Generated coords on a stretched mesh (e.g. 14 wide × 2 tall desk plank) will give non-uniform per-axis stretch. Voronoi with uniform mapping scale will still produce elongated cells. Fix: use Object coords + mapping scale that accounts for the mesh's actual dimensions.

### Scale Factor-of-2 Gotcha

`bpy.ops.mesh.primitive_cube_add(size=1.0)` creates a cube with vertices at ±0.5. The total span in each axis is 1.0, not 0.5. When setting `obj.scale = (w, h, d)`, the final span equals `(w, h, d)` — **not** `(2w, 2h, 2d)`. Early in the desk build we set `scale = (PLANK_HEIGHT - GAP) / 2` thinking we needed half-extents, which made every plank half as tall as intended.

### Light Position Must Scale With Asset Size

If you 2× the size of an asset, the light rig needs to scale proportionally in position AND size. Leaving a light at its original local offset while the subject grows around it causes visible hot spots where the light's footprint aligns with a feature.

### Stray Node Connections Cause Mystery Rendering

Inspect materials with:
```python
for link in mat.node_tree.links:
    print(link.from_node.name, '->', link.to_node.name, link.to_socket.name)
```

We once had `ParticleInfo.Location → BSDF.Coat Normal` wired accidentally. With no particles in scene, that output a zero vector, which corrupted the coat layer and made one plank look distinctly lighter than its neighbors. Took a while to find by process of elimination. Compare node-graph signatures across materials to spot outliers:
```python
sig = tuple(sorted(n.bl_idname for n in mat.node_tree.nodes))
```

### Build Text in Brass

For the "SIEGE" title on the book cover:
```python
bpy.ops.object.text_add(location=(x, y, z))
text.data.body = "SIEGE"
text.data.size = 0.32
text.data.extrude = 0.04           # 3D thickness
text.data.bevel_depth = 0.008       # rounded letter edges
text.data.align_x = 'CENTER'
text.data.align_y = 'CENTER'
text.data.space_character = 1.1
text.data.materials.append(brass)
```

Default Blender font (Bfont Regular) works fine — it's a serif that reads as period-appropriate for medieval text. A custom blackletter/medieval `.ttf` would push it further if needed.

### Parenting for Hinged Rotations

The half-open book needed its front cover + title + corners to rotate as a group around the spine edge. Pattern:
1. Create an empty at the pivot point (spine edge, at cover mid-height)
2. Build all cover parts at their normal positions
3. Parent each part to the empty: `p.parent = pivot; p.matrix_parent_inverse = pivot.matrix_world.inverted()`
4. Rotate the empty: `pivot.rotation_euler = (0, radians(-55), 0)`

All children follow.

## Frontend Integration Pattern

Rendered sprites are used in two ways:

1. **Baked into backgrounds** (desk) — applied via CSS `body { background-image }` with `background-size: cover`. Static.
2. **Layered as interactive elements** (book, citadel, gates, nodes) — `<img>` tags at fixed or in-flow positions, with hover states and click handlers driven by CSS/JS, not baked into the sprite.

For layered elements, always render with `film_transparent = True` and save as RGBA PNG so they composite cleanly.

When an interactive element needs to look like it sits on the desk (book, nodes), the lighting in its own render should roughly match the desk's key-light direction (warm key upper-left) so the shadows feel unified.

## Troubleshooting Quick Reference

| Symptom | Likely Cause |
|---|---|
| One object/plank brighter than rest | Stray shader link (check with node-graph signature comparison); or rim light aligned with that object |
| Bright orange/yellow edges in narrow gaps | Bloom is enabled — turn it off for sprite renders |
| Texture shows as horizontal streaks instead of round patterns | Generated coords on a stretched mesh — switch to Object coords or compensate mapping scale |
| Voronoi creates obvious blob spots in color | Voronoi in color path — move it to bump only, use noise for color variation |
| Render dimensions wrong after scaling | Forgot `bpy.ops.object.transform_apply` after setting `obj.scale` |
| Subject half the expected size | Used `size=1.0` cube + `scale = dim/2` thinking size was half-extent; it isn't. |
| Material looks fine on one mesh, wrong on another | Mapping uses Generated but meshes have different bbox shapes. Use Object or explicit UV. |

## Adding a New Asset (Checklist)

1. Pick an offset position (next +100 X from the last asset)
2. Create a collection, name it, link to scene collection
3. Build geometry inside the collection's XYZ-offset space
4. Reuse existing materials (`Book_Leather`, `Book_Brass`, `Book_OpenPages`, `WoodPlank_XX` variants) where possible
5. Add a camera + 3 lights in the same collection, named `<Asset>Cam`, `<Asset>Key`, `<Asset>Fill`, `<Asset>Rim`
6. Set `scene.camera = new_cam`
7. Render with `film_transparent=True`, RGBA PNG, to `frontend/public/sprites/<asset>.png`
8. Leave the camera/lights in place so the asset can be re-rendered later without rebuilding
