---
name: New Prague drivers
overview: Add Petr Pavel on a motorbike, Robert Šlachta in the existing police car, and Miloš Zeman in a Challenger boat, and give Zdeněk Hřib the Letná start. The character row moves above the district and the street.
todos:
  - id: characters
    content: Add Pavel, Šlachta, and Zeman to the selector, URL aliases, and the seven-way roll. Pin Hřib to Letenské náměstí and Pavel to a new Pražský hrad start.
    status: pending
  - id: motorbike
    content: Add a motorbike ride and mesh, distinct from the bicycle and the scooter.
    status: pending
  - id: police-spawn
    content: Spawn Šlachta in the existing police car, sirens off, behind another player or a traffic car.
    status: pending
  - id: arrest
    content: Let Šlachta arrest a nearby player only while his sirens are on, using the existing busted screen.
    status: pending
  - id: challenger
    content: Add the Vltava Challenger boat with the reclined figure and Zeman's river start.
    status: pending
  - id: card-order
    content: Put the character row above the district row and the street row, still hidden until the card is ready.
    status: pending
isProject: false
---

# New drivers, chase spawn, and arrest

Work on a new branch from the current review tip in [PragueGTA-revolut](PragueGTA-revolut) (`cursor/revolut-email-login-efde`). Do not touch the extended-map checkout. Do not merge.

## Who starts where

The welcome card already cycles Filip, Elon, Dave, and Zdeněk in [src/character-select.js](PragueGTA-revolut/src/character-select.js). Special starts already exist for Filip: with no `start=` he opens at Národní muzeum and does not take a cycle step ([src/pavlova.js](PragueGTA-revolut/src/pavlova.js) `resolveDriverStart`). A `start=` URL still wins for everyone.

- **Petr Pavel**, label `Motorbike — Petr Pavel`. New ride, not the bicycle and not a scooter. `?driver=pavel` / `petr-pavel`. No `start=` opens at a new landmark **Pražský hrad**, on a driveable road at the castle in Hradčany. Hradčanská stays the tram stop it is. The new place is a normal landmark, so the street arrows can reach it too.
- **Zdeněk Hřib** stays on his pedal bicycle. No `start=` opens at the existing **Letenské náměstí** and does not advance the cycle. Same rule as Filip and the museum.
- **Robert Šlachta**, label `Police car — Robert Šlachta`. He occupies the current Prague police estate (`createPoliceBody`, livery `praha`) from [src/player-car-renderer.js](PragueGTA-revolut/src/player-car-renderer.js). Sirens start off. `H` already toggles them on a police car. `?driver=slachta` / `robert-slachta`.
- **Miloš Zeman**, label `Challenger — Miloš Zeman`. `?driver=zeman` / `milos-zeman`. No `start=` puts him on the Vltava between Karlův most and Most Legií, not on a street.

A missing `?driver=` rolls all seven equally and still does not write the roll into localStorage. An unknown `?driver=` stays Elon.

## Police chase spawn

Šlachta does not use the street cycle. Before Start:

- If another player is already in the demo room, place the cruiser on the road about 40 m behind them, facing them.
- If nobody else is online yet, place him the same way behind a traffic car once traffic exists.
- If neither is available when he presses Start, use Letenské náměstí and do not teleport him after he is driving.
- Sirens stay off until he presses `H`. He does not start with a wanted level.

## Arrest

Yes. Only Šlachta, only while his sirens are on, and only against another player within about 8 m. That other client plays the busted screen the game already uses when AI police catch you, then they respawn cleared. Sirens off does nothing. Stealing a police car as Filip does not gain this. The room already publishes position, `siren`, and `arrest` in [src/net/protocol.js](PragueGTA-revolut/src/net/protocol.js); the new part is Šlachta writing an arrest that the other client applies locally.

## Challenger

A water-only ride. Yellow upper tube, blue hull, the word **CHALLENGER** on the tube, matching the photo. A heavy reclined figure sits low in the ring, paddles up, as if he is half in the water. It moves on mapped Vltava water and stops at the bank. It is not a car and not the bicycle.

## Motorbike

A new ride kind, faster than the bicycle, steered like a bike, with its own mesh (tank, seat, two wheels). It does not reuse the city bicycle or the e-scooter.

## Card order

In [index.html](PragueGTA-revolut/index.html), once the card is ready the rows are:

1. Character
2. Praha 1–7
3. Street

The character row stays hidden while `#intro` is not `.ready`, which is already the rule. The loading line stays under the “Loading game” heading. The district and street rows stay where they are during the load.
