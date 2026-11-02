---
name: Macinka Dodge RAM
overview: Add Petr Macinka as a ninth Prague driver in a stylized Dodge RAM, starting on the road in front of Poslanecká sněmovna when no street is named in the URL.
todos:
  - id: driver
    content: Add Macinka to the welcome card, aliases, likeness, and pinned start
    status: pending
  - id: ram
    content: Add a stylized Dodge RAM player body and seat, kept out of traffic
    status: pending
  - id: start
    content: Place Poslanecká sněmovna on the carriageway in front of the Chamber
    status: pending
  - id: tests
    content: Update and run the driver, look, and vehicle tests
    status: pending
isProject: false
---

# Petr Macinka in a Dodge RAM

Work in [PragueGTA](/Users/dave/Development/_GameDev(Playful)/PragueGTA). Same pattern as Filip’s G-Class and Kraus’s X5: a named welcome-card driver, an original mesh, and a pinned start. No photograph on the face, and no Dodge badge artwork. `?driver=petr` stays Petr Pavel.

## Driver

Add him last in [src/character-select.js](src/character-select.js), so the card wraps Kraus → Macinka → Filip.

- Label `Dodge RAM — Petr Macinka`, id `macinka`, vehicle type `ram`.
- `?driver=macinka` and `?driver=petr-macinka`. A missing `?driver=` rolls all nine equally. An unknown value stays Elon.
- A `start=` URL still wins. With no `start=`, pin him in [src/pavlova.js](src/pavlova.js) the way Kraus is pinned to Divadlo Bez zábradlí, and do not advance the street cycle.

Public portraits show a clean-shaven man with short dark brown hair, no glasses, and a dark suit over a light shirt. In [src/character-looks.js](src/character-looks.js) that is a short dark haircut, no beard, no glasses, navy jacket `#1a2744`, light shirt only if the jacket slot is used the way Dave’s is. About 1.78 m. No downloaded face.

## Truck

A new player body in [src/vehicle-models.js](src/vehicle-models.js), kept out of `VEHICLE_TYPES` so traffic does not spawn it. Crew-cab proportions from the published RAM 1500: about 5.92 m long, 2.08 m wide, 1.96 m tall, wheelbase 3.67 m. Tall cab, short bed, big arches, chrome crosshair grille, clearcoat. Paint is a deep metallic blue, not the black G, the black X5, the orange Scala, or the white Roadster.

Also register `ram` where the other player cars are named: the remote-car allowlist in [src/net/remote-presence.js](src/net/remote-presence.js), and the seat height in [src/player-travel-renderer.js](src/player-travel-renderer.js) (cab like the G-Class, belt about 1.3 m).

## Start

The Chamber is Sněmovní 4, Malá Strana, about 50.0892 N, 14.4038 E. Add a landmark **Poslanecká sněmovna** in [cities/prague/city.json](cities/prague/city.json), district Praha 1 - Malá Strana.

The spawn is the driveable carriageway in front of the building, facing along that street, not inside the palace. If Sněmovní is in the road pack, use it. If it is not, use the nearest road the truck actually fits on. Same check as Divadlo Bez zábradlí in [tests/prague-drivers.test.mjs](tests/prague-drivers.test.mjs): the car samples sit on that road, and the building index is empty at the point.

## Tests

Update the welcome-card cycle (`kraus` + 1 is Macinka, then Filip), the new aliases, the likeness, the mesh name and the fact it is not traffic, and the pinned start. Run the driver, character-select, looks, and seated-driver tests.
