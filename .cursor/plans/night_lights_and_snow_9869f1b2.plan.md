---
name: Night lights and snow
overview: Give the player car real night lamps and beams, and make falling snow look like flakes instead of slowed rain. Other cars and street lamps get the same kind of glow only where it stays cheap.
todos:
  - id: player-lamps
    content: Player head cones and tail lamps that follow night, bad weather, and braking
    status: pending
  - id: snow-flakes
    content: Replace slowed rain streaks with soft flakes and a light ground dusting
    status: pending
  - id: npc-lamps
    content: Per-car head and tail tint on nearby traffic, with brighter brake tails
    status: pending
  - id: street-lamps
    content: Night glow on existing lamp posts, without real point lights
    status: pending
  - id: tests
    content: Cover flakes versus streaks, and when the player lamps are on
    status: pending
isProject: false
---

# Night lamps and real snow

Work on a new branch from `feature/prague-seasons` in [PragueGTA-seasons](PragueGTA-seasons). Do not use `city/prague-expand`.

The player car already has small glowing patches, and braking already raises the tail material on the detailed car. They do not light the road, and they stay dim in daylight and at night. Snow is the rain line mesh in [src/weather.js](PragueGTA-seasons/src/weather.js), only slower and white.

## Player car (required)

The occupied car is the detailed model from [src/vehicle-models.js](PragueGTA-seasons/src/vehicle-models.js), driven by [src/player-car-renderer.js](PragueGTA-seasons/src/player-car-renderer.js) and [src/vehicles.js](PragueGTA-seasons/src/vehicles.js). The nose points along -Z.

- Lamps on when the daytime look is `night`, and also while rain, thunder, or snow is active. Off on a clear day and during white night.
- Head lenses stay bright warm-white (unlit, so night exposure does not wash them out). Two soft cones parented to the car point down the road. These are local transparent meshes, not scene `SpotLight`s. A real spotlight would light the merged city tiles and cost the same kind of frame time the extended map already struggled with.
- Tail lenses stay red while the lamps are on, and jump brighter while braking. The existing brake hook in `animateVehicle` stays; it needs the player tail material every time, including after a car swap.
- Daytime lenses go dark and the cones hide.

## Snow (required)

Falling snow stops sharing the rain streaks.

- Rain stays short line segments in the camera box.
- Snow is a second single draw of soft round flakes in that same box: varied size, slow fall, and a sideways sway, not a streak. Only one of the two is visible.
- Roads and the ground pick up a light white dusting from the existing snow uniform. Grass and leaves already do. No accumulation, tracks, or piles. Snow still does not gloss the road, and it still does not play the rain loop.

## Other cars (nice to have)

Traffic is instanced in [src/traffic-renderer.js](PragueGTA-seasons/src/traffic-renderer.js). Head and tail are already their own batches, but every car in a family shares one material, so a brake change today would light the whole fleet.

- At night, or in rain, thunder, or snow, tint each visible car’s head batch warm-white and its tail batch red.
- A braking car’s tail instance goes brighter. Cars in the far box stay dark.
- No beams and no extra lights on the fleet.

## Street lamps (nice to have)

Prague already has lamp posts in [src/mapped-furniture.js](PragueGTA-seasons/src/mapped-furniture.js). The cream head is merged into the post, so it cannot glow on its own.

- One instanced unlit bulb at each lamp head inside the existing view range, on only at night.
- No point lights.

## Tests

Extend [tests/weather.test.mjs](PragueGTA-seasons/tests/weather.test.mjs) so snow shows flakes and hides streaks, and rain still shows streaks. Add a small test that player lamps are on at night and in snow, off at a clear midday, and that braking raises only the tail. Then run the weather and vehicle tests.
