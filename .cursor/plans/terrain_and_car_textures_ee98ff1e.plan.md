---
name: Terrain and car textures
overview: Add licensed CC0 albedo (and light normal/roughness) maps for ground and roads, and a subtle paint flake on cars, on city/prague-wide. Building façades stay for a later step.
todos:
  - id: fetch-cc0-maps
    content: Download Poly Haven CC0 asphalt + ground (+ small paint flake), write public/textures/ and sources.json, credit in NOTICE.
    status: completed
  - id: wire-terrain-roads
    content: Apply ground map to the terrain plane; sample asphalt in surfaceMaterial asphalt branch with world XZ UVs; keep wetness.
    status: completed
  - id: wire-car-paint
    content: Add subtle flake/noise to vehicle paint materials; keep SKODA_PAINT and Praha police colours.
    status: completed
  - id: ship-textures
    content: Commit on city/prague-wide, push, update PR, deploy to gta-prague Heroku.
    status: completed
isProject: false
---

# Terrain and car textures

Shipped: ground, road, and car-paint textures are on origin/main (https://github.com/smarlify/gta-prague/pull/5).

The 2 km Praha city is playable. Roads and the ground plane still look flat: [PragueGTA/src/main.js](PragueGTA/src/main.js) uses a solid `#94988b` ground mesh and a vertex-coloured `surfaceMaterial` whose asphalt and setts are **procedural** GLSL (lines ~192–226). Cars in [PragueGTA/src/vehicle-models.js](PragueGTA/src/vehicle-models.js) are clearcoated solid colours; Prague already picks Škoda paints via [PragueGTA/src/czech-fleet.js](PragueGTA/src/czech-fleet.js).

This step adds real tileable textures for **terrain + cars only**. No photo façades, no scraping, no district rebuild.

## Sources (CC0 only)

Ship small maps under `public/textures/` (1K JPEG or WebP, under a few MB total) from Poly Haven, the same family already credited in [PragueGTA/NOTICE.md](PragueGTA/NOTICE.md) for granite:

- **Roads / asphalt:** Poly Haven asphalt (e.g. `asphalt_02` or `aerial_asphalt_01`) — albedo (+ normal and roughness if the pack stays small)
- **Terrain ground** (the big plane under parks/earth): Poly Haven grass or compacted ground albedo
- **Car paint flake:** a tiny seamless noise / metal flake (CC0), used only as a weak clearcoat/normal modulation — no logos, no brand marks

Record page URLs and authors in `public/textures/sources.json` and a NOTICE row, same pattern as `public/sounds/sources.json`.

## Terrain and roads

1. Load the asphalt and ground maps once at boot (`TextureLoader`, `SRGBColorSpace` for albedo, `RepeatWrapping`, world-metre repeat ~0.4–1.0 m).
2. On `surfaceMaterial.onBeforeCompile`, for the dark asphalt branch (`diffuseColor.r < 0.35`), multiply/mix the procedural tone with `texture2D(uAsphalt, vGround.xz * uScale)` instead of relying only on hash grain. Keep wetness / puddle behaviour.
3. Leave the granite-sett branch on the existing `GRANITE_SETTS_GLSL` (already photo-guided). Optional: a light cobble map later; not required in this pass.
4. On the plain `ground` mesh, set `map` (and optional `normalMap` / `roughnessMap`) to the terrain texture so parks and bare earth are not a flat green-grey slab.

Do not change surface pack formats or re-run `city:build`.

## Cars

1. In `createDetailedVehicle` / paint material setup, attach the flake noise to paint materials (shared texture, cloned materials still get unique colours).
2. Keep `SKODA_PAINT` and police Praha livery as the colour source. Texture only adds micro-variation and clearcoat response.
3. Do not add Škoda badges or Czech number-plate fonts in this pass.

## Ship

Work on `city/prague-wide`. Commit textures + code + NOTICE/sources only (not orphan wider-radius packs). Push, update the open PR, deploy `git push heroku HEAD:main` if the slug still fits. Hooks on.

## Verify

Drive on asphalt and off-road grass; confirm maps tile without swimming. Traffic and player cars show flake under sun; colours still look like the Škoda palette. No façade texture work in this PR.
