---
name: Smaller extended Prague
overview: Rebase the extended Prague branch onto current main, drop the long Magistrála and airport strips, fully build the north chain the way the centre is built, and shorten the draw distance so the extra city stays playable. An FPS figure goes on the HUD.
todos:
  - id: rebase
    content: Stash the detail-culling edits and rebase city/prague-expand onto origin/main, keeping centre-depth behaviour
    status: pending
  - id: trim-map
    content: Remove the Magistrála/D1 and Evropská-airport corridors; keep Troja-Bohnice-Stromovka-Holešovice
    status: pending
  - id: full-north
    content: Give the north chain the same buildings, trees, and furniture as the centre
    status: pending
  - id: fps-distance
    content: Shorten fog and camera far without deleting nearby detail, and show FPS on the HUD
    status: pending
isProject: false
---

# Smaller extended Prague

Work in the existing worktree [`PragueGTA-expand`](PragueGTA-expand) on `city/prague-expand` (`1a0f75b`). Do not switch the main PragueGTA checkout off `main`. Do not deploy until this smaller map is the thing being pushed.

## Rebase onto current main

`origin/main` is `4f45838`. That tip already has centre depth: 2.4 km disk, Charles Bridge decks, bored tunnels removed, centre parks and statues, plaster and car paint, Praha only, and the district tab title.

`city/prague-expand` was cut before that, at the Bungee merge. Rebase it onto `origin/main`.

The worktree is dirty in `src/geo.js`, `src/main.js`, `src/sea.js`, `src/terrain-mesh.js`, and three tests. Those edits skip pavement and anything under about 2 pixels. That removes detail. Stash them aside and do not replay that culling. Keep the centre-depth files from `main` when the rebase conflicts, then put the corridor registration back on top.

## Smaller map

In [`PragueGTA-expand/src/prague-corridors.js`](PragueGTA-expand/src/prague-corridors.js), remove the two long strips:

- `magistrala` (Magistrála, Wilsonova, 5. května, Spořilov, D1)
- `airport` (Evropská, Lipská, Aviatická, out to Václav Havel)

Keep the north road: Holešovice is already inside the 2.4 km disk, Stromovka sits on its north edge ([`prague-scenery.js`](PragueGTA-expand/src/prague-scenery.js)), and `troja` plus `bohnice` are the corridors past that. Leave the other shorter strips (Žluté lázně, Barrandov, Palmovka, Kobylisy, the two spojky) registered. They are not the long cuts named here.

## Full objects on the north chain

Corridor packs today are road outlines. The provenance note says buildings stay on the main city build, which is why the new ground feels half-made.

For Troja, Bohnice, and the Stromovka edge, build the same layers the centre already has: roads, pavement, buildings, trees, and street furniture, using the centre-depth rules already on `main` (bridge decks, no bored-tunnel driving, park planting caps, shared textures). Do not thin those objects to fit a larger ring. Do not rebuild Magistrála or the airport road at all.

## Draw distance, not fewer objects

Fog is `Fog('#b9cbd4', 330, 850)` and the camera far plane is `1500` in [`src/main.js`](PragueGTA-expand/src/main.js). Bring the fog end and the camera far plane in so the GPU is not shading the whole disk. Leave meshes, textures, and small street objects in place inside that shorter range. Do not revive the stashed 2-pixel cull.

## FPS

Show a rolling FPS figure on the existing HUD, next to the district label in [`index.html`](PragueGTA-expand/index.html). Update it on the same throttle as `updateHUD` (about 140 ms), from frame deltas, so the DOM is not written every frame.

## Ship

New commits on `city/prague-expand` after the rebase. Open a pull request against `main`. Do not merge. Do not `git push heroku` until the smaller map is what that branch contains.
