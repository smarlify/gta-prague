---
name: Prague live weather
overview: On a branch from main, set the existing day and weather looks from Prague’s clock and a single weather request, and add morning, night, snow, and thunderstorm without extra geometry.
todos:
  - id: branch
    content: Branch feature/prague-live-weather from origin/main in PragueGTA
    status: pending
  - id: looks
    content: Add morning, night, and snow looks, plus a snow tint and thunderstorm flash
    status: pending
  - id: live
    content: Drive the look from Europe/Prague time and one Open-Meteo fetch, with (auto) labels
    status: pending
  - id: rain-audio
    content: Copy the CC0 rain loops and play them only while rain or snow is on
    status: pending
  - id: ship
    content: Test, open the PR, and deploy the branch to Heroku
    status: pending
isProject: false
---

# Prague live weather

Branch `feature/prague-live-weather` from current `origin/main` in [PragueGTA](PragueGTA). Do not touch the expand worktree. Open a pull request. Deploy that branch to the review host after the tests pass, so the centre city shows the live look. Do not merge.

## What already exists

[src/weather.js](PragueGTA/src/weather.js) cycles Midday, Golden evening, White night, Overcast, and Rain. Rain is 2600 streaks in a box around the camera and already turns the road wet. The T button calls `look.cycle()`.

Missing for this: a morning look, a dark night (White night is a June dusk and stays in the manual cycle only), snow, and lightning. Marooned’s storm is a sky flash in [web/src/dayNight.ts](Marooned/web/src/dayNight.ts) plus CC0 rain loops at `assets/audio/rain.ogg` and `assets/audio/rainSoft.ogg`. There is no thunder recording to copy.

## Clock and forecast

Time is `Europe/Prague` from `Intl`, with no request. One Open-Meteo call at startup for the current WMO weather code at the city origin (50.09, 14.42), then again every 30 minutes. No API key, so nothing secret ships in the client. If the request fails, keep the clock and assume clear.

Map the hour, then let weather replace the clear look:

- 05:00–09:30 morning, 09:30–16:00 midday, 16:00–21:00 golden evening, otherwise night
- Drizzle and rain codes use Rain. Thunderstorm codes use Rain plus flashes. Snow codes use Snow.
- The button reads `Morning (auto)`, `Rain (auto)`, `Thunderstorm (auto)`, and the same `(auto)` suffix for the others.
- T still cycles looks. Automatic is the first step, so T can return to the live Prague conditions. A manual look has no `(auto)` suffix.

Recompute the automatic look when the hour changes or a fetch returns. Do not fetch or retint every frame. The blend that already runs in `look.update` stays.

## New looks

Add Morning (low eastern sun), Night (dim blue, short enough fog to match the current rain look’s reach), and Snow (overcast sky, no darkening of the road). Thunderstorm is the rain look, not a second sky preset.

Snow reuses the rain streaks, drawn white and slower, and a `snow` uniform already next to `WEATHER_UNIFORMS`. Grass and leaf materials mix toward white from that uniform. Bark stays. No new tree geometry and no second grass texture.

Lightning follows Marooned: during a thunderstorm code only, a flash every several seconds that lifts the sky and hemisphere light, then fades. Copy the two CC0 rain loops into `public/sounds/` and play the louder one while rain or snow is active, only if sound is on. No generated thunder clip.

## Tests

Pure functions, no network: morning, midday, evening, and night hours; rain, thunder, and snow codes; a failed forecast leaves a clear clock look; automatic labels end in `(auto)`. Existing weather tests keep passing.
