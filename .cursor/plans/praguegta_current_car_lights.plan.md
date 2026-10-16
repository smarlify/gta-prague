---
name: Current car lights
overview: Headlight on/off/auto follows the start car because every lamp update paints the detailed home model. Apply L only while the player is in a car, and only to the car they occupy.
todos:
  - id: gate-headlight-key
    content: Ignore L unless travel.mode is car, so on/off/auto does not change while the player is on foot or on a bike or scooter
    status: pending
  - id: paint-occupied-car
    content: Apply the lamp mode only to the occupied entry in createPlayerCarRenderer, and leave travel.homeCar unchanged after the player leaves it
    status: pending
  - id: beams-on-current-body
    content: Give the occupied police body and any other entered car their own head lens and head-beams, so the mode can show on that car
    status: pending
isProject: false
---

# Lights follow the occupied car

Work on `stack/headlight-switch` in [PragueGTA](_GameDev(Playful)/PragueGTA). That branch has the L-key headlights (`e1b187e`). The PragueGTA checkout is `feature/prague-live-weather` and the PragueGTA-expand checkout is `city/prague-expand`; neither has this control. Both worktrees share one repo, and the lamp files match on `feature/prague-headlight-switch`. Leave both checkouts untouched until the fix is done on the headlight branch.

## Why the start car lights up

`travel.homeCar` is the car passed into `PlayerTravel.reset` in [src/player-travel.js](_GameDev(Playful)/PragueGTA/src/player-travel.js). `travel.car` becomes the car entered in `interact`. The renderer stores the detailed start model as `first` and maps it with `entries.set(home, first)` in `sync`.

Beams exist only on a detailed build. `createDetailedVehicle` in [src/vehicle-models.js](_GameDev(Playful)/PragueGTA/src/vehicle-models.js) sets `userData.head`, `userData.tail`, and `userData.beams` when `detailed` is true. The start car is `createVehicle(0, true)`. A stolen civilian car is `createVehicle(0, false, type)`, so those three fields stay null. `createPoliceBody` in [src/police-model.js](_GameDev(Playful)/PragueGTA/src/police-model.js) stores `userData.tail` and `userData.mounts.head` (a wig-wag point) and does not set `userData.head` or `userData.beams`.

`paintLamps` in [src/player-car-renderer.js](_GameDev(Playful)/PragueGTA/src/player-car-renderer.js) always calls `applyPlayerLamps(first.model, lamps)` and then every other entry. `setLamps` and `sync` both call it. The frame in [src/main.js](_GameDev(Playful)/PragueGTA/src/main.js) calls `playerCars.setLamps(playerHeadlightsOn(headlightMode, look.name, look.weather))` with no occupancy check. `applyPlayerLamps` in [src/vehicles.js](_GameDev(Playful)/PragueGTA/src/vehicles.js) toggles `userData.beams`. That group is on the start car, so night or L lights the parked start car. The police body has nothing for that function to turn on.

Siren does not choose the mesh. `KeyH` toggles `stolenSirenOn` only when `travel.mode==='car'` and `travel.car.visual.police`, and `setSiren` flashes `entry===current`. Night only makes `playerHeadlightsOn('auto', 'night', …)` true through `vehicleLampsOn`. The mesh choice is `paintLamps` on `first`.

## Fix

In the `KeyL` handler in `main.js`, cycle `headlightMode` only when `travel.mode==='car'` and `travel.car` is set. On foot, on a bike or scooter, or swimming, leave the mode and every car’s lamps as they are.

In `createPlayerCarRenderer`, apply `applyPlayerLamps` to the occupied entry only (`current`, the model for `travel.car`) and only while `travel.mode==='car'`. Skip `first` whenever it is not that entry, so `travel.homeCar` keeps the lamp state it had when the player got out. `setLamps` needs the travel mode, or `sync` should be the only painter and should no-op off a car.

Give the occupied body its own lamps. Build an entered civilian car with `createVehicle(0, true, type)` so it gets a private head material and `head-beams`. On the police body, set `userData.head` to the mesh named `head`, and parent a `head-beams` group (same dipped spots as `headBeams`, using that body’s length, width, and belt) with `userData.beams` pointing at it. `userData.tail` is already per body.

Extend [tests/vehicle-lamps.test.mjs](_GameDev(Playful)/PragueGTA/tests/vehicle-lamps.test.mjs) or the player-car renderer test: with a detailed home car and a police body, turning lamps on while `travel.car` is the police car shows beams on the police model and leaves the home beams as they were. L while `travel.mode` is `walk` does not change either.
