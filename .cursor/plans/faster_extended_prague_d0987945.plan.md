---
name: Faster extended Prague
overview: Rebase the extended Prague branch onto current main, then make the north districts cheaper to draw without removing buildings, trees, or furniture.
todos:
  - id: rebase
    content: Rebase city/prague-expand onto origin/main and force-with-lease the feature branch
    status: pending
  - id: chunk-buildings
    content: Split extruded fallback buildings into ~180 m shadow-casting cells
    status: pending
  - id: match-fog
    content: Pull surface and tree distances in line with the 580 m fog; leave region preload and all geometry in place
    status: pending
  - id: furniture-shadows
    content: Stop mapped extension furniture from casting shadows
    status: pending
  - id: pr
    content: "Test, push, and update PR #14 without deploying"
    status: pending
isProject: false
---

# Faster extended Prague

Work in [PragueGTA-expand](PragueGTA-expand) on `city/prague-expand` (`04454ec`). Rebase onto `origin/main` (`cf0cb26`, bus liveries). Force-with-lease that branch only. Leave pull request https://github.com/smarlify/gta-prague/pull/14 open. Do not deploy until you have driven it and asked for the review host.

## Why it is still slow

Fog already ends at 580 m and the camera far plane is 720, but the expensive work is wider than that, and the new districts are one solid mesh.

- [src/main.js](PragueGTA-expand/src/main.js) still loads ground out to 900–1000 m and trees out to 850 m (`SPECIES_LOD.far` in [src/tree-species.js](PragueGTA-expand/src/tree-species.js)).
- Troja and Bohnice have no 3D roof tiles. `createFallbackBuildings` extrudes every footprint into **one** shadow-casting mesh (478 in Troja, 1354 in Bohnice). The shadow box is only about 400 m across, but a mesh that covers the whole district is redrawn into the 2048 shadow map whenever you are inside it.
- Bohnice also adds 807 pieces of mapped furniture, each casting a shadow.

The centre pack stays as it is. Pavement, trees, and building shapes stay. The stashed 2-pixel cull stays unused.

## Rebase

Replay the eight expand commits onto `cf0cb26`. Keep the shorter fog, the 720 camera, the HUD FPS, the north layers, and the new start places. Take the DPP / FlixBus / RegioJet bus work from main. Expect a conflict in `src/main.js` where both sides edited the boot path.

## Draw less past the fog

In the expand branch only:

- Surface ensure and the driving update use about 640 m, just past the fog, instead of 900 and 1000.
- Tree far LOD ends near 600 m. Near and mid trees stay.
- Extension regions still open before you reach them (`createExtensionStreamer` radius stays large enough that Troja and Bohnice are loaded as you approach). Ground tiles inside a region follow the shorter surface radius.

## Split the extruded districts

Change `createFallbackBuildings` so footprints are merged per cell of about 180 m, not into one city-wide mesh. Each cell keeps `castShadow`. Distant cells then drop out of the frustum and the shadow map. Centre fallback buildings use the same split. Do not drop footprints and do not switch the north back to empty packs.

Mapped furniture in the extensions stays visible and stops casting shadows. Benches and bins are smaller than the shadow texel.

## Check

- A test that a few hundred spread-out footprints become several meshes, and each mesh stays inside one cell.
- Existing building and bus tests still pass. Finland stays skipped.
- Update the open pull request. Do not merge it and do not push Heroku.
