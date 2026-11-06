---
name: Jan Kraus BMW X5
overview: Add Jan Kraus in a BMW X5, starting on Jungmannova in front of Divadlo Bez zábradlí at Palác Adria. Real-person likenesses stay out of this version.
todos:
  - id: kraus-character
    content: Add Jan Kraus to the selector, the URL aliases, and the equal roll.
    status: pending
  - id: adria-start
    content: Add the Divadlo Bez zábradlí start on Jungmannova and pin Kraus there when start= is absent.
    status: pending
  - id: x5-body
    content: Add a dark BMW X5 body that traffic does not use.
    status: pending
isProject: false
---

# Jan Kraus in a BMW X5

Add him on the drivers branch that is already being built (`feature/prague-drivers` in [PragueGTA-drivers](PragueGTA-drivers)), after the seven drivers in the open plan. Do not edit that plan file. Do not start a second checkout. Do not merge.

## Driver

In [src/character-select.js](PragueGTA-drivers/src/character-select.js), add a choice with the same dash as the others:

- Label: `BMW X5 — Jan Kraus`
- Name: `Jan Kraus`
- `?driver=kraus` and `?driver=jan-kraus`

A missing `?driver=` rolls him in with the others, equally, and still does not save that roll. An unknown `?driver=` stays Elon. A `start=` URL still wins.

## Start

No `start=` opens at a new landmark, **Divadlo Bez zábradlí**, district `Praha 1 - Nové Město`. That is Palác Adria, Jungmannova 31/36, where Show Jana Krause is filmed. Put the car on the driveable street in front of the palace, not inside the building. Národní divadlo stays where it is (about 14.41355, 50.08105). Adria is east of that, on Jungmannova; snap the point to the nearest road there and face along the street.

Same rule as Filip and the museum: this default does not advance the start cycle. The street arrows can still select the new place, because it is a normal landmark in [cities/prague/city.json](PragueGTA-drivers/cities/prague/city.json).

## Car

A new player body in [src/vehicle-models.js](PragueGTA-drivers/src/vehicle-models.js), type `x5`, kept out of `VEHICLE_TYPES` so traffic does not spawn it. An X5 is a rounded SUV, not the boxy Mercedes G. Dark paint. Kidney grille and the X5 proportions are enough; it does not need a copied BMW badge.

## Not this version

The people stay name-and-vehicle choices. Do not model real faces, hair, or clothes for Jan Kraus or anyone else. That can be a later pass.
