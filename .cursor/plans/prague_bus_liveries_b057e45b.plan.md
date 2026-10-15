---
name: Prague bus liveries
overview: "Give Prague buses three original liveries on a branch from main: red-and-cream MHD/PID city buses, green FlixBus coaches, and yellow RegioJet coaches. No logos, and no Heroku deploy."
todos:
  - id: branch
    content: Branch feature/prague-bus-liveries from origin/main in PragueGTA
    status: pending
  - id: liveries
    content: Add dpp, flixbus, and regiojet paints in bus-renderer.js without logos
    status: pending
  - id: classify
    content: Classify FlixBus from routeName at load; fetch RegioJet coach paths into coach-corridors.json
    status: pending
  - id: spawn
    content: Spawn a mix of red city buses plus one FlixBus and one RegioJet before duplicates
    status: pending
  - id: tests-pr
    content: Add livery tests, push the branch, open the PR, do not deploy
    status: pending
isProject: false
---

# Prague bus liveries

Branch `feature/prague-bus-liveries` from current `origin/main` in [PragueGTA](PragueGTA) (`0528d59`). Leave the expand worktree and the review host alone. Open the pull request. Do not push to Heroku, so release v85 stays the extended map.

## What is wrong now

[src/bus-renderer.js](PragueGTA/src/bus-renderer.js) is still the Helsinki body. Prague only recolors the city paint to `#c8102e` and the thin lower accent to cream via [cities/prague/city.json](PragueGTA/cities/prague/city.json). The white HSL swooshes stay. Every path in [public/cities/prague/bus-corridors.json](PragueGTA/public/cities/prague/bus-corridors.json) is `kind: "city"`, including 552 routes whose `routeName` already starts with `Flixbus`. RegioJet is not in that file: [scripts/city-build.mjs](PragueGTA/scripts/city-build.mjs) never imports `route=coach`.

## Liveries

Original meshes and estimated colours, same rule as the tram note. No wordmarks, fox, or photographed wraps. The destination board keeps the line and destination already in the data.

- **MHD/PID:** red body `#c8102e`, wide cream belt `#f3eee4` along the flank, red roof. Drop the HSL swooshes and the thin Helsinki accent for this livery. This is the centre DPP scheme (city buses, trolleybuses, AE).
- **FlixBus:** vivid green body, light skirt, dark glass, coach doors. Applied when `routeName` starts with `Flixbus`. Those paths become `kind: "coach"` at load time. Do not rewrite the 6.7 MB corridor file.
- **RegioJet:** yellow body, charcoal roof and window band, coach doors. A small script fetches OSM `route=bus` and `route=coach` relations inside the existing 2.4 km disk whose name or operator matches RegioJet, runs them through `usableBusPaths`, and writes `public/cities/prague/coach-corridors.json`. [src/bus-system.js](PragueGTA/src/bus-system.js) appends that file when it is present. If the query returns no drivable paths, ship the yellow material and say so. Do not paint FlixBus shapes yellow.

## Spawning

Helsinki stays on its current colours and caps when a path has no livery. For Prague, coach slots are filled so FlixBus and RegioJet each get a bus before a second bus of the same livery. Raise the Prague coach cap to 4 (two of each) from the bus system. City cap stays 6 for the red buses.

## Tests

Extend [tests/buses.test.mjs](PragueGTA/tests/buses.test.mjs):

- A model with no livery is still Helsinki blue `#098bd0`, and the mesh count stays within the current budget.
- `dpp` is red with cream flank geometry and no swoosh.
- A `Flixbus …` route name resolves to green and `kind: "coach"`.
- `regiojet` is yellow.
- With both coach liveries near the player, the simulation spawns one of each.
