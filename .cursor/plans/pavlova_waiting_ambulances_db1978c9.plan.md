---
name: Pavlova waiting ambulances
overview: After the car-selector merge is on main, add a separate branch where Filip Turek starts at the museum facing I. P. Pavlova, and a red-and-white ambulance with blue lights waits at every crossroad there and only pulls out for him.
todos:
  - id: branch-after-main
    content: Branch off origin/main only after the selector merge is on main. Do not deploy this branch.
    status: in_progress
  - id: filip-museum-start
    content: When Filip is the driver and start= is absent, open at Národní muzeum facing south toward I. P. Pavlova. Other drivers keep the start cycle. A start= URL still pins the place.
    status: pending
  - id: place-ambulances
    content: Place one waiting ambulance per clustered junction within 150 m of I. P. Pavlova, Turek in a car only.
    status: pending
  - id: livery-and-pullout
    content: Paint red/white with flashing blue lights. The near ambulance drives into Turek, then returns to its wait spot.
    status: pending
  - id: tests
    content: Replace the one-shot chase test with junction placement, Turek-only, and pull-out coverage.
    status: pending
isProject: false
---

# Waiting ambulances at I. P. Pavlova

Do this only after the Mercedes G, Roadster, and character-select merges are on `origin/main`, and after that `main` has been deployed. Do not edit those pull requests. Do not deploy this branch to Heroku, so the review app stays on the merged selector.

New branch off that `main`, for example `feature/pavlova-ambulances`. Open a pull request. Do not merge it.

## What is there now

[src/pavlova.js](PragueGTA-character/src/pavlova.js) runs one chase. `stepPavlova` is called from [src/main.js](PragueGTA-character/src/main.js) only when `chosenCharacter.pavlova` is set, which [src/character-select.js](PragueGTA-character/src/character-select.js) sets for Filip Turek alone. Two white vans appear once behind the car on the museum-to-Pavlova road, drive into it, and then never return. [src/pavlova-scene.js](PragueGTA-character/src/pavlova-scene.js) draws them as a white van with a red stripe and no blue lights.

A crossroad is already a graph node with three or more streets, `junctionNode` in [src/lane-model.js](PragueGTA-character/src/lane-model.js).

## Filip’s start

The chase corridor in `PAVLOVA_RUN` already runs south from Národní muzeum (`14.4309, 50.0796`, local about 691 east, 875 south) toward I. P. Pavlova (`14.4305, 50.0752`, local about 649 east, 1462 south). South is `heading` near `Math.PI`, which is the direction `onPavlovaRun` already treats as toward the square.

Filip does not open there today. The boot start still cycles for every driver, and the default driver is Elon.

When the chosen driver is Filip and `start=` is absent, skip the cycle and open at Národní muzeum, heading south toward I. P. Pavlova. Elon and Dave keep the cycle. A `start=` URL still pins that place for Filip too and does not change the heading rule only when the pinned place is the museum: if `start=` is the museum, face south; if it is some other place, use that place’s own heading.

## Behaviour

- While the player is Filip Turek and in a car, one ambulance waits at each crossroad in the I. P. Pavlova square, not on the whole of Praha 2 and not on the museum road.
- Take junction nodes within about 150 m of the I. P. Pavlova start (local metres near the south end of `PAVLOVA_RUN`, about 649 east, 1462 south). Cluster nodes within 25 m so a multi-node junction gets one ambulance, parked on a side approach short of the stop line, facing the crossing.
- Body is white with a red belt and a red cross. A roof bar flashes blue (emissive lenses, same idea as the police light bar in [src/police-model.js](PragueGTA-character/src/police-model.js)). No person in the cab, and no raised hand.
- The ambulance stays parked with the lights on. When Turek’s car comes within about 25 m of that crossing, that ambulance drives into his car, then returns to its wait spot so the next crossing still has one waiting. Elon and Dave never see them, and they are hidden when Turek is on foot.
- Replace the one-shot chase behind the car. Do not keep both.

## Tests

Update the Filip test in [tests/prague-wider.test.mjs](PragueGTA-character/tests/prague-wider.test.mjs): junctions in the Pavlova disk each get a waiting unit, a point outside the disk does not, Elon (`ram` unset) gets none, and approaching one junction moves only that unit.

Also cover the start: Filip with no `start=` resolves to Národní muzeum facing south; Elon with no `start=` still uses the cycle; `?start=` still wins for Filip.
