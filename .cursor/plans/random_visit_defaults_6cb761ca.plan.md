---
name: Random visit defaults
overview: When a visit does not pin the car, the time, or the weather in the URL, each of those is rolled once at load. Auto stays on the daytime and weather lists, and a URL param still pins that one setting.
todos:
  - id: roll-car
    content: When ?driver= is absent, roll Filip, Elon, or Dave once and do not use the saved driver. A known param still pins. Unknown stays Elon.
    status: completed
  - id: roll-look
    content: When ?time= or ?weather= is absent, roll that half once with auto off. A pinned half stays pinned. (auto) stays on the T and Y lists.
    status: completed
  - id: tests
    content: Cover missing params, pinned params, and auto staying off until the player cycles to it.
    status: completed
isProject: false
---

# Random car, daytime, and weather

Branch off current `origin/main` (`e6ad027`). Open a pull request. Do not merge it. Deploy that branch to the review app when it is ready, so a bare visit can be checked against a pinned one.

## What a bare visit does today

[src/main.js](PragueGTA-ambulances/src/main.js) starts the look with `automatic: true`, so daytime follows the Prague clock and weather follows the forecast. [src/cities.js](PragueGTA-ambulances/src/cities.js) `sceneQuery` leaves a missing or unknown `time` or `weather` as null, and [src/weather.js](PragueGTA-ambulances/src/weather.js) then shows the live value with `(auto)`.

[src/character-select.js](PragueGTA-ambulances/src/character-select.js) `resolveDriver` keeps a saved driver when `?driver=` is absent, and otherwise uses Elon.

T and Y already cycle concrete looks first and return to auto at the end of the list (`cycle` / `cycleWeather`). That list stays.

## New default

Roll once, before the welcome card paints, and do not roll again on Start, pause, or T/Y.

- No `?driver=`: one of Filip Turek, Elon Musk, or Dave N., with equal chance. Do not read the saved driver for this choice. A known `?driver=` still wins. An unknown `?driver=` stays Elon.
- No `?time=`: one of morning, midday, golden, night, or white night. Not auto. A known `?time=` still pins that look and turns daytime auto off, as it does now.
- No `?weather=`: one of clear, overcast, rain, thunder, or snow. Not auto. A known `?weather=` still pins that weather only.

The two halves stay independent. `?time=night` with no weather param is night plus a random weather, not the live forecast.

`(auto)` remains a step on the T and Y lists. Choosing it still follows the live clock or the forecast, and the label still gains `(auto)` only while that half is automatic. A random pick shows the plain label, with no `(auto)`.

Pass `automatic: false` into `createLook` for any half the URL did not pin, after the roll, so `followDay` / `followWeather` do not replace it. Headlight auto is unchanged. The start cycle is unchanged. If the roll is Filip and `start=` is absent, he still opens at Národní muzeum facing I. P. Pavlova.

Do not write the random car into `localStorage` on load. A later arrow choice on the welcome card can still save, but the next visit with no `?driver=` rolls again.

## Tests

Inject the roll (a function that returns an index) so the tests do not depend on `Math.random`. Cover a missing param, a pinned param, and that auto is off until the player cycles to it. Update the driver test that currently expects a saved Filip to win when `?driver=` is absent.
