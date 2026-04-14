# World Map Parchment Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing `/world` hex grid in a Blender-rendered parchment map frame with CSS-animated torches and drifting clouds. Hex grid component is not touched; a new wrapper, new assets, and a new CSS module add the atmosphere around it.

**Architecture:** Two static Blender renders (parchment + torch sconce) live in `frontend/public/sprites/`. A new fixed-aspect wrapper in `frontend/src/app/world/page.tsx` layers `parchment-map.png` behind the existing `<HexGrid>`, with CSS-animated torch sconces at the corners and inline SVG clouds drifting across the top strip. All motion is CSS (`transform` + `opacity` only) gated behind `prefers-reduced-motion`.

**Tech Stack:** Blender EEVEE + Python (driven through the Blender MCP), Next.js 16 app router, React 19, Tailwind 4, CSS modules. No new npm dependencies.

**Design spec:** `docs/superpowers/specs/2026-04-13-world-map-parchment-frame-design.md`

**Testing note:** This is a visual/asset task. Strict TDD doesn't apply — there's no unit test that can assert "the parchment looks good." Verification at each step is either (a) the file exists with expected dimensions, (b) TypeScript compiles, or (c) the page loads in the dev server without runtime errors. Manual visual iteration happens at the end, but per project convention we don't prescribe step-by-step manual walkthroughs — the user drives that themselves.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `<blender-scene>` | Modify | Add `Parchment` collection at offset (500, 100, 0) and `TorchSconce` collection at (600, 100, 0), each with camera + 3-point lights. Scene is the existing long-lived Blender file per `docs/blender-style-guide.md`. Note: `(400, 100, 0)` is already occupied by a pre-existing `Compass` collection that broke the +100 X offset convention — we skip past it. |
| `frontend/public/sprites/parchment-map.png` | Create | 2400×1600 RGBA, transparent background, AgX Medium High Contrast. The main frame asset. |
| `frontend/public/sprites/torch-sconce.png` | Create | 512×512 RGBA, transparent background. Unlit sconce only — flame is pure CSS. |
| `frontend/src/app/world/parchment.module.css` | Create | CSS module with `@keyframes flicker-opacity`, `@keyframes flicker-scale`, `@keyframes drift`, plus `.parchmentFrame`, `.torch`, `.torchGlow`, `.cloud` class selectors. Keyframes gated behind `@media (prefers-reduced-motion: no-preference)`. |
| `frontend/src/app/world/page.tsx` | Modify | Replace the existing `<div className="border...">` wrapper around `<HexGrid>` with a fixed-aspect parchment-frame wrapper containing the parchment image, the positioned hex grid, a `TorchOverlay` component, and a `CloudDrift` component. Both overlay components live inline in the same file. |

**Untouched:** `HexGrid.tsx`, all other components, all lib files, `providers.tsx`. Every other section of `world/page.tsx` (registration overlay, header, Your Hold, Battles, FactionPanel) is unchanged.

---

## Verification conventions used throughout

**Frontend** (run from `/Users/modeofo/Apps/siege/frontend`):
- **Typecheck:** `npx tsc --noEmit` — expected clean (0 errors).
- **Scoped lint:** `npx eslint src/app/world/page.tsx` — lints only the file changed; avoids the 5 pre-existing project-wide lint errors.
- **Dev server smoke:** `npm run dev`, visit `http://localhost:3000/world` — page loads without runtime errors.

**Blender** (driven through the Blender MCP — exact tool names depend on which MCP server is connected; the executing agent uses whichever Python-execution or mesh/material primitives it exposes):
- After any collection/material build: save the scene (`bpy.ops.wm.save_mainfile()`).
- After any render: confirm the output PNG exists at the expected path with expected dimensions (`file frontend/public/sprites/parchment-map.png` or equivalent).

**Style guide reference:** The project's Blender conventions (collection naming, offset convention, camera rig, lighting recipe, material library names, render settings) are defined in `docs/blender-style-guide.md`. Read that file before starting any Blender task.

---

## Task 1: Build parchment sheet geometry + camera + lights

**Files:**
- Modify: the existing long-lived Blender scene file (Blender MCP session)

Build the geometry skeleton and lighting rig for the parchment asset. No materials yet — that's Task 2.

- [ ] **Step 1: Create the `Parchment` collection at offset `(400, 100, 0)`**

Using the Blender MCP, run (or equivalent via native MCP primitives):

```python
import bpy

PARCHMENT_ORIGIN = (500, 100, 0)

# Create collection
parchment_coll = bpy.data.collections.new("Parchment")
bpy.context.scene.collection.children.link(parchment_coll)
```

- [ ] **Step 2: Create the parchment sheet mesh**

A 14 × 9 × 0.05 plane with enough subdivisions for the corner curl. Use `primitive_plane_add` and scale:

```python
bpy.ops.mesh.primitive_plane_add(size=1.0, location=PARCHMENT_ORIGIN)
sheet = bpy.context.object
sheet.name = "ParchmentSheet"
sheet.scale = (14.0, 9.0, 1.0)  # final span 14 × 9
bpy.ops.object.transform_apply(scale=True)

# Subdivide for corner curl (4 cuts each axis)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=4)
bpy.ops.object.mode_set(mode='OBJECT')

# Add slight z-displacement at corners for gentle curl (Proportional Editing pattern or simple vertex group + displace modifier)
# For v1, leave it flat — we'll revisit if the render feels too rigid.

# Link to collection
for coll in sheet.users_collection:
    coll.objects.unlink(sheet)
parchment_coll.objects.link(sheet)
```

- [ ] **Step 3: Add the camera (orthographic, 28° tilt)**

```python
import math

CAM_TILT_DEG = 28
CAM_DIST = 12.0  # bigger than book's 6.5 to fit the larger sheet
tilt = math.radians(CAM_TILT_DEG)

cam_x = PARCHMENT_ORIGIN[0]
cam_y = PARCHMENT_ORIGIN[1] - math.sin(tilt) * CAM_DIST
cam_z = PARCHMENT_ORIGIN[2] + math.cos(tilt) * CAM_DIST + 0.4

bpy.ops.object.camera_add(location=(cam_x, cam_y, cam_z))
cam = bpy.context.object
cam.name = "ParchmentCam"
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 16.0  # fits the 14-unit-wide sheet with small margin; tune after first render
cam.rotation_euler = (tilt, 0, 0)

for coll in cam.users_collection:
    coll.objects.unlink(cam)
parchment_coll.objects.link(cam)
```

- [ ] **Step 4: Add the 3-point lighting rig**

```python
def add_light(name, light_type, location, size, energy, color, rotation):
    bpy.ops.object.light_add(type=light_type, location=location)
    light = bpy.context.object
    light.name = name
    light.data.size = size
    light.data.energy = energy
    light.data.color = color
    light.rotation_euler = rotation
    for coll in light.users_collection:
        coll.objects.unlink(light)
    parchment_coll.objects.link(light)
    return light

# KEY — warm, upper-left, strongest
add_light(
    "ParchmentKey", 'AREA',
    (PARCHMENT_ORIGIN[0] - 4, PARCHMENT_ORIGIN[1] - 2, PARCHMENT_ORIGIN[2] + 8),
    size=7, energy=1000, color=(1.0, 0.85, 0.65),
    rotation=(math.radians(-15), math.radians(-20), 0),
)

# FILL — cool, opposite side
add_light(
    "ParchmentFill", 'AREA',
    (PARCHMENT_ORIGIN[0] + 5, PARCHMENT_ORIGIN[1] + 3, PARCHMENT_ORIGIN[2] + 7),
    size=8, energy=300, color=(0.75, 0.85, 1.0),
    rotation=(math.radians(25), math.radians(20), 0),
)

# RIM — warm, behind subject
add_light(
    "ParchmentRim", 'AREA',
    (PARCHMENT_ORIGIN[0], PARCHMENT_ORIGIN[1] + 6, PARCHMENT_ORIGIN[2] + 5),
    size=5, energy=400, color=(1.0, 0.75, 0.45),
    rotation=(math.radians(40), 0, 0),
)
```

- [ ] **Step 5: Save the scene**

```python
bpy.ops.wm.save_mainfile()
```

- [ ] **Step 6: Preview render to verify framing**

Set scene camera and do a quick low-sample render to `/tmp/parchment-framing.png`:

```python
bpy.context.scene.camera = bpy.data.objects["ParchmentCam"]
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 533  # 3:2 preview
bpy.context.scene.render.film_transparent = True
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.image_settings.color_mode = 'RGBA'
bpy.context.scene.eevee.taa_render_samples = 32  # low for preview
bpy.context.scene.view_settings.look = 'AgX - Medium High Contrast'
bpy.context.scene.render.filepath = '/tmp/parchment-framing.png'
bpy.ops.render.render(write_still=True)
```

Verify: `/tmp/parchment-framing.png` exists. The render shows a flat grey plane (no material yet) filling most of the frame with a small margin. If the plane is too small or clips the frame, tune `cam.data.ortho_scale` and re-preview before moving on.

- [ ] **Step 7: Commit is deferred until Task 4 (final render)**

Blender work commits as one unit at the end of the render task. Do not commit intermediate scene files — the `.blend` file is not tracked in git (it lives outside the repo per the existing convention).

---

## Task 2: Build parchment + painted-landscape material

**Files:**
- Modify: Blender scene (Parchment collection materials)

Build a single `Parchment_Map` material that carries both the aged-parchment base and the painted landscape ring. The landscape is procedural paint, not 3D terrain — a ColorRamp mask based on distance from center blends each zone's color into the base parchment.

- [ ] **Step 1: Create the `Parchment_Map` material**

```python
mat = bpy.data.materials.new("Parchment_Map")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
# Clear default nodes except output
for n in list(nodes):
    if n.type != 'OUTPUT_MATERIAL':
        nodes.remove(n)
output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
```

- [ ] **Step 2: Build the parchment base color (aged paper)**

Reuse the approach from `Book_OpenPages` in the style guide: high-frequency paper noise + low-frequency stain noise fed through a ColorRamp.

```python
# Texture coordinates (Generated — paper fills the plane 0..1)
coord = nodes.new('ShaderNodeTexCoord')

# Paper grain (high-frequency)
paper_noise = nodes.new('ShaderNodeTexNoise')
paper_noise.inputs['Scale'].default_value = 120.0
paper_noise.inputs['Detail'].default_value = 8.0
links.new(coord.outputs['Generated'], paper_noise.inputs['Vector'])

# Stain noise (low-frequency)
stain_noise = nodes.new('ShaderNodeTexNoise')
stain_noise.inputs['Scale'].default_value = 2.5
stain_noise.inputs['Detail'].default_value = 4.0
stain_noise.inputs['Distortion'].default_value = 1.2
links.new(coord.outputs['Generated'], stain_noise.inputs['Vector'])

# Mix paper + stain at 0.4 (favor stain for tonal wandering)
mix_base = nodes.new('ShaderNodeMix')
mix_base.data_type = 'FLOAT'
mix_base.inputs['Factor'].default_value = 0.4
links.new(paper_noise.outputs['Fac'], mix_base.inputs['A'])
links.new(stain_noise.outputs['Fac'], mix_base.inputs['B'])

# ColorRamp → aged parchment tones
ramp_base = nodes.new('ShaderNodeValToRGB')
ramp_base.color_ramp.interpolation = 'EASE'
ramp_base.color_ramp.elements[0].position = 0.2
ramp_base.color_ramp.elements[0].color = (0.45, 0.35, 0.22, 1.0)  # shadow
ramp_base.color_ramp.elements[1].position = 0.9
ramp_base.color_ramp.elements[1].color = (0.85, 0.72, 0.48, 1.0)  # highlight
links.new(mix_base.outputs['Result'], ramp_base.inputs['Fac'])
```

- [ ] **Step 3: Build zone masks (mountain / dune / forest / coast)**

Use `Separate XYZ` from Generated coords to build four directional gradient masks that each light up one edge of the parchment.

```python
sep = nodes.new('ShaderNodeSeparateXYZ')
links.new(coord.outputs['Generated'], sep.inputs['Vector'])

# North mask (top → mountain zone): Y near 1
north_ramp = nodes.new('ShaderNodeValToRGB')
north_ramp.color_ramp.elements[0].position = 0.55
north_ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
north_ramp.color_ramp.elements[1].position = 0.95
north_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
links.new(sep.outputs['Y'], north_ramp.inputs['Fac'])

# East mask (right → dunes): X near 1
east_ramp = nodes.new('ShaderNodeValToRGB')
east_ramp.color_ramp.elements[0].position = 0.55
east_ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
east_ramp.color_ramp.elements[1].position = 0.95
east_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
links.new(sep.outputs['X'], east_ramp.inputs['Fac'])

# South mask (bottom → forest): Y near 0 — use Invert
south_ramp = nodes.new('ShaderNodeValToRGB')
south_ramp.color_ramp.elements[0].position = 0.05
south_ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
south_ramp.color_ramp.elements[1].position = 0.45
south_ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
links.new(sep.outputs['Y'], south_ramp.inputs['Fac'])

# West mask (left → coast): X near 0
west_ramp = nodes.new('ShaderNodeValToRGB')
west_ramp.color_ramp.elements[0].position = 0.05
west_ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
west_ramp.color_ramp.elements[1].position = 0.45
west_ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
links.new(sep.outputs['X'], west_ramp.inputs['Fac'])
```

- [ ] **Step 4: Build zone colors and blend them into the base parchment**

Each zone has a flat-ish color (with minor noise-driven variation) multiplied by its mask, then added/mixed over the base parchment.

```python
def make_zone_color(name, base_color, noise_scale=8.0):
    """Create a simple tinted zone color with subtle noise variation."""
    n = nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = noise_scale
    n.inputs['Detail'].default_value = 6.0
    links.new(coord.outputs['Generated'], n.inputs['Vector'])
    r = nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = tuple(c * 0.75 for c in base_color[:3]) + (1,)
    r.color_ramp.elements[1].color = base_color
    links.new(n.outputs['Fac'], r.inputs['Fac'])
    r.label = f"zone:{name}"
    return r

mountain_col = make_zone_color("mountain", (0.35, 0.33, 0.32, 1), noise_scale=6)    # warm grey
dune_col     = make_zone_color("dune",     (0.72, 0.55, 0.28, 1), noise_scale=5)    # ochre
forest_col   = make_zone_color("forest",   (0.24, 0.35, 0.22, 1), noise_scale=10)   # desaturated green
coast_col    = make_zone_color("coast",    (0.40, 0.50, 0.55, 1), noise_scale=4)    # muted blue-grey

# Mix each zone over the base using its mask as the factor
def mix_over(a_node, a_socket, b_node, b_socket, mask_node):
    m = nodes.new('ShaderNodeMixRGB')
    links.new(mask_node.outputs['Color'], m.inputs['Fac'])
    links.new(a_node.outputs[a_socket], m.inputs['Color1'])
    links.new(b_node.outputs[b_socket], m.inputs['Color2'])
    return m

m1 = mix_over(ramp_base, 'Color', mountain_col, 'Color', north_ramp)
m2 = mix_over(m1, 'Color', dune_col, 'Color', east_ramp)
m3 = mix_over(m2, 'Color', forest_col, 'Color', south_ramp)
m4 = mix_over(m3, 'Color', coast_col, 'Color', west_ramp)
```

- [ ] **Step 5: Wire to Principled BSDF and assign to the sheet**

```python
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Roughness'].default_value = 0.92
links.new(m4.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

# Subtle bump from paper noise
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.25
links.new(paper_noise.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

# Assign
sheet = bpy.data.objects["ParchmentSheet"]
if sheet.data.materials:
    sheet.data.materials[0] = mat
else:
    sheet.data.materials.append(mat)
```

- [ ] **Step 6: Preview render and save**

```python
bpy.context.scene.render.filepath = '/tmp/parchment-material-preview.png'
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_mainfile()
```

Verify: `/tmp/parchment-material-preview.png` shows aged parchment with four tinted edge zones (grey mountains at top, ochre dunes at right, green forest at bottom, blue-grey coast at left). If zones are too saturated, tune each `make_zone_color` base color lighter. If zones bleed too far toward center, tighten each mask's ColorRamp positions (narrower band of black-to-white transition).

---

## Task 3: Add brass props (compass rose + map pins)

**Files:**
- Modify: Blender scene (Parchment collection — add prop objects)

Reuse the existing `Book_Brass` material from the scene. If it doesn't exist in this scene, create a copy of the approach from the style guide (metallic=1.0, noise-driven color ramp, subtle bump).

- [ ] **Step 1: Verify or create the `Book_Brass` material**

```python
brass = bpy.data.materials.get("Book_Brass")
if brass is None:
    # Create from style-guide recipe
    brass = bpy.data.materials.new("Book_Brass")
    brass.use_nodes = True
    bn = brass.node_tree.nodes
    bl = brass.node_tree.links
    for n in list(bn):
        if n.type != 'OUTPUT_MATERIAL':
            bn.remove(n)
    b_out = next(n for n in bn if n.type == 'OUTPUT_MATERIAL')
    b_bsdf = bn.new('ShaderNodeBsdfPrincipled')
    b_bsdf.inputs['Metallic'].default_value = 1.0
    b_noise = bn.new('ShaderNodeTexNoise')
    b_noise.inputs['Scale'].default_value = 4.0
    b_noise.inputs['Detail'].default_value = 10.0
    b_ramp = bn.new('ShaderNodeValToRGB')
    b_ramp.color_ramp.elements[0].position = 0.25
    b_ramp.color_ramp.elements[0].color = (0.22, 0.14, 0.04, 1)  # tarnish
    b_ramp.color_ramp.elements[1].position = 0.85
    b_ramp.color_ramp.elements[1].color = (0.75, 0.52, 0.18, 1)  # worn
    bl.new(b_noise.outputs['Fac'], b_ramp.inputs['Fac'])
    bl.new(b_ramp.outputs['Color'], b_bsdf.inputs['Base Color'])
    b_bsdf.inputs['Roughness'].default_value = 0.4
    bl.new(b_bsdf.outputs['BSDF'], b_out.inputs['Surface'])
```

- [ ] **Step 2: Build the compass rose (NE corner)**

A flat disc with four raised directional arms.

```python
PARCHMENT_ORIGIN = (500, 100, 0)
COMPASS_POS = (PARCHMENT_ORIGIN[0] + 5.5, PARCHMENT_ORIGIN[1] + 3.2, PARCHMENT_ORIGIN[2] + 0.05)

# Disc base
bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=0.05, location=COMPASS_POS)
disc = bpy.context.object
disc.name = "CompassDisc"
disc.data.materials.append(brass)

# Four directional arms (elongated diamond shapes)
import math as _m
for i, angle_deg in enumerate([0, 90, 180, 270]):
    a = _m.radians(angle_deg)
    pos = (COMPASS_POS[0] + _m.cos(a) * 0.4, COMPASS_POS[1] + _m.sin(a) * 0.4, COMPASS_POS[2] + 0.06)
    bpy.ops.mesh.primitive_cube_add(size=0.6, location=pos)
    arm = bpy.context.object
    arm.name = f"CompassArm_{angle_deg}"
    arm.scale = (0.5, 0.12, 0.08)
    arm.rotation_euler = (0, 0, a)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    arm.data.materials.append(brass)

# Link everything to the Parchment collection
parchment_coll = bpy.data.collections.get("Parchment")
for obj_name in ["CompassDisc", "CompassArm_0", "CompassArm_90", "CompassArm_180", "CompassArm_270"]:
    o = bpy.data.objects.get(obj_name)
    if o:
        for c in o.users_collection:
            c.objects.unlink(o)
        parchment_coll.objects.link(o)
```

- [ ] **Step 3: Scatter 5 map pins along the painted landscape zones**

```python
import random
random.seed(42)  # stable placement across re-runs

PIN_POSITIONS = [
    (PARCHMENT_ORIGIN[0] - 5.0, PARCHMENT_ORIGIN[1] + 3.5),  # NW mountain
    (PARCHMENT_ORIGIN[0] - 2.0, PARCHMENT_ORIGIN[1] + 3.8),  # N mountain
    (PARCHMENT_ORIGIN[0] + 5.5, PARCHMENT_ORIGIN[1] - 2.0),  # SE dune
    (PARCHMENT_ORIGIN[0] + 1.0, PARCHMENT_ORIGIN[1] - 3.5),  # S forest
    (PARCHMENT_ORIGIN[0] - 5.5, PARCHMENT_ORIGIN[1] - 1.0),  # SW coast
]

for i, (x, y) in enumerate(PIN_POSITIONS):
    # Small sphere for pin head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(x, y, PARCHMENT_ORIGIN[2] + 0.2))
    head = bpy.context.object
    head.name = f"MapPinHead_{i}"
    head.data.materials.append(brass)

    # Tapered cone for pin shaft
    bpy.ops.mesh.primitive_cone_add(radius1=0.04, radius2=0.0, depth=0.18, location=(x, y, PARCHMENT_ORIGIN[2] + 0.1))
    shaft = bpy.context.object
    shaft.name = f"MapPinShaft_{i}"
    shaft.data.materials.append(brass)

    for obj in [head, shaft]:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        parchment_coll.objects.link(obj)
```

- [ ] **Step 4: Preview render and save**

```python
bpy.context.scene.render.filepath = '/tmp/parchment-props-preview.png'
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_mainfile()
```

Verify: `/tmp/parchment-props-preview.png` shows the parchment with a brass compass rose in the NE corner and 5 brass map pins scattered along the painted zones. Brass should have the tarnish-to-worn tonal variation, not look uniformly gold.

---

## Task 4: Final parchment render + commit

**Files:**
- Create: `frontend/public/sprites/parchment-map.png`

- [ ] **Step 1: Configure final render settings**

```python
scene = bpy.context.scene
scene.camera = bpy.data.objects["ParchmentCam"]
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 2400
scene.render.resolution_y = 1600
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.eevee.taa_render_samples = 128
scene.eevee.use_gtao = True
scene.eevee.use_bloom = False
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.2  # tune after first final render
scene.render.filepath = '/Users/modeofo/Apps/siege/frontend/public/sprites/parchment-map.png'
```

- [ ] **Step 2: Render and save scene**

```python
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_mainfile()
```

- [ ] **Step 3: Verify the output file**

Run in bash:

```bash
ls -la /Users/modeofo/Apps/siege/frontend/public/sprites/parchment-map.png
file /Users/modeofo/Apps/siege/frontend/public/sprites/parchment-map.png
```

Expected: file exists, reported as `PNG image data, 2400 x 1600, 8-bit/color RGBA`.

- [ ] **Step 4: Commit**

```bash
cd /Users/modeofo/Apps/siege
git add frontend/public/sprites/parchment-map.png
git commit -m "$(cat <<'EOF'
feat(world): add parchment map asset for /world frame

2400x1600 RGBA render of an aged parchment sheet with painted landscape
zones (mountains N, dunes E, forest S, coast W), a brass compass rose,
and scattered map pins. Used as the frame layer behind the hex grid.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds with the single new file.

---

## Task 5: Build torch sconce + render + commit

**Files:**
- Modify: Blender scene (add `TorchSconce` collection at offset `(600, 100, 0)`)
- Create: `frontend/public/sprites/torch-sconce.png`

- [ ] **Step 1: Create the collection and origin**

```python
import bpy, math

TORCH_ORIGIN = (600, 100, 0)
torch_coll = bpy.data.collections.new("TorchSconce")
bpy.context.scene.collection.children.link(torch_coll)
```

- [ ] **Step 2: Build the sconce geometry**

Wall-mount bracket + cup-shaped reservoir + burnt stick. Keep it simple — it's a 512×512 asset and only needs to read as "torch holder."

```python
# Bracket (rectangular base attached to a vertical stem)
bpy.ops.mesh.primitive_cube_add(size=0.4, location=(TORCH_ORIGIN[0], TORCH_ORIGIN[1], TORCH_ORIGIN[2]))
bracket = bpy.context.object
bracket.name = "TorchBracket"
bracket.scale = (1.0, 0.3, 2.0)  # tall thin bracket
bpy.ops.object.transform_apply(scale=True)

# Cup (cylinder with bevelled top)
bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=0.25, location=(TORCH_ORIGIN[0], TORCH_ORIGIN[1] + 0.15, TORCH_ORIGIN[2] + 0.35))
cup = bpy.context.object
cup.name = "TorchCup"

# Burnt stick (thin cylinder poking out of the cup)
bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.4, location=(TORCH_ORIGIN[0], TORCH_ORIGIN[1] + 0.15, TORCH_ORIGIN[2] + 0.6))
stick = bpy.context.object
stick.name = "TorchStick"

# Link to collection
for obj in [bracket, cup, stick]:
    for c in obj.users_collection:
        c.objects.unlink(obj)
    torch_coll.objects.link(obj)
```

- [ ] **Step 3: Apply materials**

Reuse `Book_Brass` (created in Task 3) on the bracket and cup. Create or reuse `NailIron` for the stick (near-black iron look — see style guide).

```python
brass = bpy.data.materials.get("Book_Brass")

iron = bpy.data.materials.get("NailIron")
if iron is None:
    iron = bpy.data.materials.new("NailIron")
    iron.use_nodes = True
    i_nodes = iron.node_tree.nodes
    i_links = iron.node_tree.links
    for n in list(i_nodes):
        if n.type != 'OUTPUT_MATERIAL':
            i_nodes.remove(n)
    i_out = next(n for n in i_nodes if n.type == 'OUTPUT_MATERIAL')
    i_bsdf = i_nodes.new('ShaderNodeBsdfPrincipled')
    i_bsdf.inputs['Base Color'].default_value = (0.04, 0.035, 0.03, 1)
    i_bsdf.inputs['Metallic'].default_value = 0.85
    i_bsdf.inputs['Roughness'].default_value = 0.75
    i_links.new(i_bsdf.outputs['BSDF'], i_out.inputs['Surface'])

bracket.data.materials.append(brass)
cup.data.materials.append(brass)
stick.data.materials.append(iron)
```

- [ ] **Step 4: Add camera + 3-point lights**

```python
CAM_DIST = 3.0
tilt = math.radians(28)

bpy.ops.object.camera_add(location=(
    TORCH_ORIGIN[0],
    TORCH_ORIGIN[1] - math.sin(tilt) * CAM_DIST,
    TORCH_ORIGIN[2] + math.cos(tilt) * CAM_DIST + 0.4,
))
cam = bpy.context.object
cam.name = "TorchCam"
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.0
cam.rotation_euler = (tilt, 0, 0)
for c in cam.users_collection:
    c.objects.unlink(cam)
torch_coll.objects.link(cam)

def add_torch_light(name, loc, size, energy, color, rot):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.name = name
    l.data.size = size
    l.data.energy = energy
    l.data.color = color
    l.rotation_euler = rot
    for c in l.users_collection:
        c.objects.unlink(l)
    torch_coll.objects.link(l)

add_torch_light(
    "TorchKey",
    (TORCH_ORIGIN[0] - 1.5, TORCH_ORIGIN[1] - 0.8, TORCH_ORIGIN[2] + 2.5),
    size=2, energy=200, color=(1.0, 0.85, 0.65),
    rot=(math.radians(-15), math.radians(-20), 0),
)
add_torch_light(
    "TorchFill",
    (TORCH_ORIGIN[0] + 1.5, TORCH_ORIGIN[1] + 1.0, TORCH_ORIGIN[2] + 2.0),
    size=2.5, energy=60, color=(0.75, 0.85, 1.0),
    rot=(math.radians(25), math.radians(20), 0),
)
add_torch_light(
    "TorchRim",
    (TORCH_ORIGIN[0], TORCH_ORIGIN[1] + 1.5, TORCH_ORIGIN[2] + 1.5),
    size=1.5, energy=100, color=(1.0, 0.75, 0.45),
    rot=(math.radians(40), 0, 0),
)
```

- [ ] **Step 5: Configure and render**

```python
scene = bpy.context.scene
scene.camera = bpy.data.objects["TorchCam"]
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
scene.eevee.taa_render_samples = 128
scene.render.filepath = '/Users/modeofo/Apps/siege/frontend/public/sprites/torch-sconce.png'
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_mainfile()
```

- [ ] **Step 6: Verify**

```bash
ls -la /Users/modeofo/Apps/siege/frontend/public/sprites/torch-sconce.png
file /Users/modeofo/Apps/siege/frontend/public/sprites/torch-sconce.png
```

Expected: file exists, reported as `PNG image data, 512 x 512, 8-bit/color RGBA`.

- [ ] **Step 7: Commit**

```bash
cd /Users/modeofo/Apps/siege
git add frontend/public/sprites/torch-sconce.png
git commit -m "$(cat <<'EOF'
feat(world): add torch sconce sprite for /world frame

512x512 RGBA render of an unlit brass+iron wall sconce. Positioned at
the corners of the parchment frame; flame + warm glow are applied via
CSS on top of this sprite.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create the CSS module with keyframes

**Files:**
- Create: `frontend/src/app/world/parchment.module.css`

- [ ] **Step 1: Create the file with all class selectors and keyframes**

```css
/* frontend/src/app/world/parchment.module.css */

.parchmentFrame {
  position: relative;
  margin-left: auto;
  margin-right: auto;
  aspect-ratio: 3 / 2;
  width: 100%;
  max-width: 64rem;
}

.parchmentImage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}

.hexGridWrapper {
  position: absolute;
  top: 12%;
  right: 14%;
  bottom: 14%;
  left: 14%;
}

.torch {
  position: absolute;
  width: 7%;
  aspect-ratio: 1 / 1;
  background-image: url("/sprites/torch-sconce.png");
  background-size: contain;
  background-repeat: no-repeat;
  pointer-events: none;
}

.torchGlow {
  position: absolute;
  top: -30%;
  left: 50%;
  width: 180%;
  height: 120%;
  transform: translateX(-50%);
  background: radial-gradient(
    ellipse at 50% 80%,
    rgba(255, 180, 90, 0.85) 0%,
    rgba(255, 140, 50, 0.55) 25%,
    rgba(255, 100, 30, 0.25) 50%,
    rgba(255, 100, 30, 0) 75%
  );
  filter: blur(6px);
  opacity: 0.85;
  will-change: transform, opacity;
  pointer-events: none;
}

.cloudClip {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 25%;
  overflow: hidden;
  pointer-events: none;
}

.cloud {
  position: absolute;
  top: 10%;
  left: 0;
  width: 30%;
  height: 80%;
  opacity: 0.2;
  filter: blur(8px);
  transform: translateX(-20%);
  will-change: transform;
}

@keyframes flicker-opacity {
  0%   { opacity: 0.70; }
  50%  { opacity: 1.00; }
  100% { opacity: 0.78; }
}

@keyframes flicker-scale {
  0%   { transform: translateX(-50%) scale(0.95); }
  50%  { transform: translateX(-50%) scale(1.08); }
  100% { transform: translateX(-50%) scale(0.98); }
}

@keyframes drift {
  0%   { transform: translateX(-20%); }
  100% { transform: translateX(140%); }
}

@media (prefers-reduced-motion: no-preference) {
  .torchGlow {
    animation:
      flicker-opacity 0.7s ease-in-out infinite alternate,
      flicker-scale 1.3s ease-in-out infinite alternate;
  }

  .cloud {
    animation: drift var(--cloud-duration, 45s) linear infinite;
    animation-delay: var(--cloud-delay, 0s);
  }
}
```

- [ ] **Step 2: Verify the file is valid CSS**

From `/Users/modeofo/Apps/siege/frontend`:

```bash
npx tsc --noEmit
```

Expected: clean (the CSS module isn't typechecked directly, but `tsc` catches any missing type declarations once we import the module). If TS complains about the CSS module import later in Task 7, ensure `frontend/src/app/globals.d.ts` or similar already declares `*.module.css` — Next.js ships with this by default in `next-env.d.ts`, so no action should be needed.

- [ ] **Step 3: Commit**

```bash
cd /Users/modeofo/Apps/siege
git add frontend/src/app/world/parchment.module.css
git commit -m "$(cat <<'EOF'
feat(world): add CSS module for parchment frame layout + animation

Defines the wrapper grid, torch glow keyframes (opacity + scale flicker),
and cloud drift keyframe. Animations gated behind
prefers-reduced-motion: no-preference.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wrap `<HexGrid>` in the parchment-frame container

**Files:**
- Modify: `frontend/src/app/world/page.tsx:99-115`

Replace the current bordered-card wrapper around `<HexGrid>` with the new parchment-frame wrapper. This task stops short of adding the torch and cloud overlays — those come in Tasks 8 and 9. After this task, the parchment image visibly sits behind the hex grid.

- [ ] **Step 1: Import the CSS module**

Edit `frontend/src/app/world/page.tsx`. Add this import at the top of the file alongside the existing imports:

```tsx
import styles from "./parchment.module.css";
```

- [ ] **Step 2: Replace the hex-grid wrapper block**

Replace this existing block:

```tsx
      {/* Hex grid */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4">
        {parcels.length === 0 ? (
          <div className="text-center text-[#7a7060] py-12">
            World not initialized. No parcels found.
          </div>
        ) : (
          <HexGrid
            parcels={parcels}
            playerAddress={address}
            homeParcelIds={
              kingdom.registered
                ? [kingdom.home0, kingdom.home1, kingdom.home2]
                : []
            }
          />
        )}
      </div>
```

with this new block:

```tsx
      {/* Hex grid — parchment frame */}
      <div className={styles.parchmentFrame}>
        <img
          src="/sprites/parchment-map.png"
          alt=""
          className={styles.parchmentImage}
        />
        <div className={styles.hexGridWrapper}>
          {parcels.length === 0 ? (
            <div className="text-center text-[#7a7060] py-12">
              World not initialized. No parcels found.
            </div>
          ) : (
            <HexGrid
              parcels={parcels}
              playerAddress={address}
              homeParcelIds={
                kingdom.registered
                  ? [kingdom.home0, kingdom.home1, kingdom.home2]
                  : []
              }
            />
          )}
        </div>
      </div>
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/modeofo/Apps/siege/frontend
npx tsc --noEmit
```

Expected: clean (0 errors).

- [ ] **Step 4: Scoped lint**

```bash
cd /Users/modeofo/Apps/siege/frontend
npx eslint src/app/world/page.tsx
```

Expected: clean. (The existing file already has no lint errors in the `world/page.tsx` scope.)

- [ ] **Step 5: Dev server smoke**

```bash
cd /Users/modeofo/Apps/siege/frontend
npm run dev
```

Expected: the dev server starts, `http://localhost:3000/world` loads, and the parchment image is visible with the hex grid overlaid on its center. No console errors. Stop the dev server (Ctrl+C) before continuing.

- [ ] **Step 6: Commit**

```bash
cd /Users/modeofo/Apps/siege
git add frontend/src/app/world/page.tsx
git commit -m "$(cat <<'EOF'
feat(world): wrap hex grid in parchment-map frame

Replaces the plain bordered-card container around <HexGrid /> with a
fixed-aspect parchment frame that layers the new parchment-map.png
behind the grid. Hex grid component is untouched; only the wrapper
around the call site changes.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add the `TorchOverlay` component

**Files:**
- Modify: `frontend/src/app/world/page.tsx`

Add an inline `TorchOverlay` component to `page.tsx` and render it inside the `parchmentFrame` div, after the hex grid wrapper. Four torches positioned at fixed percentages.

- [ ] **Step 1: Add the `TorchOverlay` component definition**

Add this definition to `frontend/src/app/world/page.tsx`, above the existing `export default function WorldPage()`:

```tsx
function TorchOverlay() {
  const positions = [
    { top: "3%", left: "2%" },    // NW
    { top: "3%", right: "2%" },   // NE
    { bottom: "4%", left: "3%" }, // SW
    { bottom: "4%", right: "3%" }, // SE
  ];

  return (
    <>
      {positions.map((pos, i) => (
        <div key={i} className={styles.torch} style={pos}>
          <span className={styles.torchGlow} />
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Render `<TorchOverlay />` inside the parchment frame**

Find the `<div className={styles.parchmentFrame}>` block from Task 7. Add `<TorchOverlay />` as the last child inside it (after the `hexGridWrapper` div):

```tsx
      <div className={styles.parchmentFrame}>
        <img ... />
        <div className={styles.hexGridWrapper}> ... </div>
        <TorchOverlay />
      </div>
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/modeofo/Apps/siege/frontend
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Scoped lint**

```bash
cd /Users/modeofo/Apps/siege/frontend
npx eslint src/app/world/page.tsx
```

Expected: clean.

- [ ] **Step 5: Dev server smoke**

```bash
cd /Users/modeofo/Apps/siege/frontend
npm run dev
```

Expected: `http://localhost:3000/world` shows 4 torch sconces at the parchment's corners, each with a flickering warm glow. Glow subtly pulses in opacity and scale. No console errors. Stop the dev server before continuing.

- [ ] **Step 6: Commit**

```bash
cd /Users/modeofo/Apps/siege
git add frontend/src/app/world/page.tsx
git commit -m "$(cat <<'EOF'
feat(world): add flickering torch sconces to parchment frame corners

Four torches at the parchment's corners with a pure-CSS flame glow
(radial gradient + dual flicker animations on opacity and scale).
Animations respect prefers-reduced-motion.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add the `CloudDrift` component

**Files:**
- Modify: `frontend/src/app/world/page.tsx`

Add an inline `CloudDrift` component with 3 wispy SVG clouds that drift across the top of the parchment frame at staggered speeds.

- [ ] **Step 1: Add the `CloudDrift` component definition**

Add this definition below `TorchOverlay` in `page.tsx`:

```tsx
function CloudDrift() {
  const clouds = [
    { top: "30%", duration: "45s", delay: "0s", scale: 1.0 },
    { top: "55%", duration: "65s", delay: "-20s", scale: 0.7 },
    { top: "15%", duration: "55s", delay: "-40s", scale: 1.2 },
  ];

  return (
    <div className={styles.cloudClip}>
      {clouds.map((c, i) => (
        <svg
          key={i}
          className={styles.cloud}
          style={
            {
              top: c.top,
              transform: `scale(${c.scale})`,
              "--cloud-duration": c.duration,
              "--cloud-delay": c.delay,
            } as React.CSSProperties
          }
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
        >
          <ellipse cx="40" cy="30" rx="35" ry="14" fill="#f0e8d8" />
          <ellipse cx="85" cy="25" rx="45" ry="18" fill="#f0e8d8" />
          <ellipse cx="140" cy="32" rx="38" ry="15" fill="#f0e8d8" />
          <ellipse cx="175" cy="28" rx="22" ry="12" fill="#f0e8d8" />
        </svg>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Render `<CloudDrift />` inside the parchment frame**

Add `<CloudDrift />` inside `<div className={styles.parchmentFrame}>`, before `<TorchOverlay />` so clouds sit behind torches in paint order:

```tsx
      <div className={styles.parchmentFrame}>
        <img ... />
        <div className={styles.hexGridWrapper}> ... </div>
        <CloudDrift />
        <TorchOverlay />
      </div>
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/modeofo/Apps/siege/frontend
npx tsc --noEmit
```

Expected: clean. If TS complains about the `CSSProperties` cast (custom CSS variables), it's expected — that's why we cast. Should compile cleanly under the existing tsconfig.

- [ ] **Step 4: Scoped lint**

```bash
cd /Users/modeofo/Apps/siege/frontend
npx eslint src/app/world/page.tsx
```

Expected: clean.

- [ ] **Step 5: Dev server smoke**

```bash
cd /Users/modeofo/Apps/siege/frontend
npm run dev
```

Expected: `http://localhost:3000/world` shows the full composition — parchment frame, flickering torches at the corners, and 3 wispy clouds drifting left-to-right across the top 25% of the frame at different speeds. No console errors. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd /Users/modeofo/Apps/siege
git add frontend/src/app/world/page.tsx
git commit -m "$(cat <<'EOF'
feat(world): add drifting clouds to parchment frame top strip

Three inline SVG clouds drift horizontally across the top 25% of the
parchment frame at staggered durations (45s, 55s, 65s). Clipped to the
top strip so they appear to pass above the painted mountains.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final polish pass

**Files:**
- Modify: `frontend/src/app/world/parchment.module.css` (likely)
- Modify: Blender scene (possibly)

This is the iteration task: view the live result, adjust, re-render/re-commit as needed.

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/modeofo/Apps/siege/frontend
npm run dev
```

Visit `http://localhost:3000/world` at desktop width (~1280px) and tablet width (~768px via browser dev tools responsive mode).

- [ ] **Step 2: Check the inner rectangle alignment**

If the hex grid overflows the parchment's blank map zone, or sits with awkward blank space on one side, tune `.hexGridWrapper` inset values in `parchment.module.css`. Each edge (`top`, `right`, `bottom`, `left`) can be adjusted independently — start with ±2% changes.

- [ ] **Step 3: Check torch positioning**

Torches should feel like they sit at the parchment's corners, not floating inside or outside. If they look wrong, adjust the `positions` array in `TorchOverlay` (percentage values).

- [ ] **Step 4: Check cloud visibility**

Clouds should be subtle — visible on close inspection but not distracting. If they're too prominent, reduce `.cloud { opacity: ... }` in the CSS module. If invisible, nudge opacity up.

- [ ] **Step 5: Check motion-reduced fallback**

In the browser, enable "reduce motion" (macOS: System Settings → Accessibility → Display → Reduce Motion; or browser dev tools rendering panel). Reload `/world`. Expected: torches are static (no flicker), clouds are static (no drift).

- [ ] **Step 6: Optional — re-render parchment or torch if visual issues**

If the parchment's landscape zones look wrong (too saturated, too dim, zones in wrong proportions) or the compass rose / pins feel off, return to Task 2 or 3 and adjust, then re-render and overwrite `parchment-map.png`. Commit the new PNG on its own.

- [ ] **Step 7: Commit any polish changes**

Only commit if changes were made. Single commit covering whatever tuning landed:

```bash
cd /Users/modeofo/Apps/siege
git add frontend/src/app/world/parchment.module.css frontend/src/app/world/page.tsx
git commit -m "$(cat <<'EOF'
fix(world): tune parchment frame inset / torch positions / cloud opacity

Polish pass after viewing the live composition.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

If no polish changes were needed, skip the commit.

---

## Self-review (plan vs spec)

**Spec coverage check:**

| Spec section | Task(s) |
|---|---|
| Architecture / layer stack | Task 7 (wrapper), Task 8 (torches), Task 9 (clouds) |
| Parchment asset spec | Tasks 1, 2, 3, 4 |
| Torch-sconce asset spec | Task 5 |
| CSS ambient overlay | Task 6 (keyframes), Task 8 (torch markup), Task 9 (cloud markup) |
| Frontend integration | Task 7 |
| `prefers-reduced-motion` gate | Task 6 (keyframes wrapped in media query) |
| Build sequence | Tasks follow the spec's build order 1→5 |
| Open iteration points | Task 10 |

No gaps. Every spec requirement has at least one task.

**Placeholder scan:** No TBD/TODO/"fill in later" content. All code blocks are complete. All commands are explicit with expected output.

**Type consistency:** The `styles` object is imported identically in Tasks 7, 8, 9. Class names (`parchmentFrame`, `parchmentImage`, `hexGridWrapper`, `torch`, `torchGlow`, `cloudClip`, `cloud`) are defined in Task 6 and referenced consistently later. `TorchOverlay` and `CloudDrift` component names are consistent between definition (Tasks 8, 9) and render (Tasks 8, 9). Custom CSS variables (`--cloud-duration`, `--cloud-delay`) are declared in the CSS module (Task 6) and used in the React inline style (Task 9).

**Scope check:** This is a single focused feature — visual frame around an existing component plus two Blender renders and one CSS module. Appropriate for a single plan.
