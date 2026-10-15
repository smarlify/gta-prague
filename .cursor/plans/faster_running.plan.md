---
name: Faster running
overview: Double on-foot running from 4.8 m/s to 9.6 m/s. Walk, cars, bikes, scooters, and collision stay as they are.
todos:
  - id: raise-run-cap
    content: In PragueGTA/src/player-travel.js, change TRAVEL_MODES.walk.run from 4.8 to 9.6. Leave speed, acceleration, braking, and the body size alone.
    status: completed
  - id: assert-cap
    content: In tests/player-travel.test.mjs, assert that Shift on flat ground reaches about 9.6 m/s and that W without Shift still tops out at 2 m/s.
    status: completed
  - id: check-in-browser
    content: On flat ground, walk reads about 7 km/h and Shift-run reads about 35 km/h. A wall still stops you. The car dial is unchanged.
    status: completed
isProject: false
---

# Faster running

Shipped: on-foot run is 9.6 m/s on origin/main (https://github.com/smarlify/gta-prague/pull/4).

On foot, running is too slow. Double it. One number changes.

## Current speed

[`PragueGTA/src/player-travel.js`](PragueGTA/src/player-travel.js) defines on-foot movement in world metres per second:

```js
walk:{label:'On foot',speed:2,run:4.8,acceleration:8,braking:12,halfWidth:.28,halfLength:.28},
```

`step` uses `run` only while sprinting (Shift, or the touch Run button). Otherwise it uses `speed`:

```js
const sprint=walk&&(this.sprint||keys.has('ShiftLeft')||keys.has('ShiftRight'));
const base=brake?0:up===down?0:up?(sprint?spec.run:spec.speed):walk?-1.4:p.speed>.15?0:-1.3;
```

The on-foot dial is true km/h (`speed * 3.6` in [`src/speedometer.js`](PragueGTA/src/speedometer.js)). Walk is 2 m/s, about 7 km/h. Run is 4.8 m/s, about 17 km/h.

## Change

Set `run` to `9.6`. That is 9.6 m/s, about 35 km/h on the dial: twice the current run.

Leave these alone:

- Walk `speed: 2`, and the reverse walk of `-1.4`
- `acceleration: 8` and `braking: 12` (reaching 9.6 takes about 1.2 s)
- Bicycle `7`, scooter `25/3.6`, and car physics
- `halfWidth`, `halfLength`, and `travelCollision` (a wall still sets speed to 0)
- Slope. Uphill still slows the run; a gentle downhill can add up to 10%

The gait already follows ground speed and is fully in the run blend by 3.6 m/s ([`advanceGait`](PragueGTA/src/person-model.js)). Do not retune it in this change.

The bump test that samples `4.8` is a sample speed, not the cap. Leave it.

## Check

`npm run dev` in `PragueGTA`, then open `http://localhost:5173/?city=prague`. Start, stop the car, press F to get out.

On flat ground:

- Hold W. The dial settles near **7**.
- Hold Shift and W. The dial settles near **35**.
- Let go of Shift. It falls back near **7**.
- Run into a building. You stop at the wall.
- Get back in the car. The car dial still uses the 70% indicated speed, and the car is not faster.
