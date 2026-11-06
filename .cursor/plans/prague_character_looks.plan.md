---
name: Prague character looks
overview: A later pass of stylized low-poly likenesses on the bodies the player can already see. Closed cars stay empty. Dave N. stays the generic rider until he describes his look.
todos:
  - id: filip-on-foot
    content: Give Filip Turek the on-foot person (solid build, short dark hair, sunglasses, dark jacket). Leave the Mercedes G cabin empty.
    status: completed
  - id: elon-on-foot
    content: Give Elon Musk the on-foot person (slim build, short brown hair, no glasses, black top). Leave the Roadster cabin empty.
    status: completed
  - id: dave-generic
    content: Leave Dave N. on the current generic rider until he describes hair, glasses, and clothes. Do not invent a face.
    status: completed
  - id: hrib-rider
    content: Give Zdeněk Hřib the bicycle rider (average build, short brown hair, glasses, dark jacket), and the same look on foot.
    status: completed
  - id: pavel-rider
    content: Give Petr Pavel the motorbike rider (tall solid build, short grey hair, no glasses, dark jacket), and the same look on foot.
    status: completed
  - id: slachta-on-foot
    content: Give Robert Šlachta the on-foot person (solid build, short dark hair, dark jacket). Leave the police car cabin empty.
    status: completed
  - id: zeman-figure
    content: Restyle the Challenger's reclined heavy figure as Miloš Zeman (heavy build, grey hair, glasses, dark jacket). No standing pedestrian.
    status: completed
  - id: kraus-on-foot
    content: After the X5 exists, give Jan Kraus the on-foot person (average build, short grey hair, glasses, dark jacket). Leave that cabin empty.
    status: completed
isProject: false
---

# Character looks

This is a later pass, after the drivers branch in [PragueGTA-drivers](PragueGTA-drivers) and after Jan Kraus's X5. It is not part of the vehicle work in progress. Do not edit [new_prague_drivers_cf380a4e.plan.md](.cursor/plans/new_prague_drivers_cf380a4e.plan.md) or [jan_kraus_bmw_x5_0ef5887c.plan.md](.cursor/plans/jan_kraus_bmw_x5_0ef5887c.plan.md). Do not change vehicles, starts, or the selector here.

Only the meshes the player can see change. Street crowds, traffic, and parked cars stay generic.

## What is already on screen

Checked in PragueGTA-drivers.

**Car.** Filip's Mercedes G, Elon's Roadster, Dave's Škoda Scala, Šlachta's police estate, and Kraus's X5 once it exists. [src/player-travel-renderer.js](PragueGTA-drivers/src/player-travel-renderer.js) draws a person in a car only when `travel.gagDriver` is set, and nothing sets it. [src/net/remote-presence.js](PragueGTA-drivers/src/net/remote-presence.js) draws the car and no person while `mode` is `car`. Glass in [src/vehicle-models.js](PragueGTA-drivers/src/vehicle-models.js) and [src/police-model.js](PragueGTA-drivers/src/police-model.js) is a dark shell. There is no driver mesh in the cabin. Leave the cabin empty.

**Bicycle.** Zdeněk's ride draws the shared person, pose `cycle`, on the bike. That is the body to change.

**Motorbike.** Pavel's ride is tank, seat, and two wheels in [src/player-ride-models.js](PragueGTA-drivers/src/player-ride-models.js). The rider is the same person, same cycle pose. That is the body to change.

**Challenger.** The person batch is skipped. The body is the `figure` group in `createChallenger`: a reclined torso, a heavy belly, a head sphere, and paddle arms, cloth `#243044`. The likeness is that figure.

**On foot.** `F` steps out of a car, off the bicycle, or off the motorbike, and the same person is drawn. For the car drivers, that walker is the only body in view. The local look is fixed in `createPlayerTravelRenderer`: height 1.75, orange jacket `#d65f39`, dark trousers, short hair, backpack. Another player's copy is `createPedMesh`: the same short-hair jacket person, shirt `#3a5a6a`, no backpack. Both copies take the character cues. Crowds do not.

The head already has eyes, brows, a nose, and a mouth as small patches. A likeness uses height, `body`, the hair cap, and jacket colour. Glasses, where listed, are a few thin pieces on that head. The boat head is a separate sphere, so Zeman's hair and glasses go on that sphere. Colours and simple meshes only. No photographs, no downloaded portraits, no textures from the web.

## People

One look per person, on the mesh above. Same cues locally and on the remote copy, from the character, not from a random seed.

- **Filip Turek.** Solid build, short dark hair, sunglasses, dark jacket. On foot only.
- **Elon Musk.** Slim build, short brown hair, no glasses, black top. On foot only.
- **Dave N.** The author. Do not invent a face from the username. He keeps the current generic rider until he sends a short description (hair, glasses, clothes). The Scala cabin stays empty.
- **Zdeněk Hřib.** Average build, short brown hair, glasses, dark jacket. On the bicycle, and the same look on foot.
- **Petr Pavel.** Tall solid build, short grey hair, no glasses, dark jacket. On the motorbike, and the same look on foot.
- **Robert Šlachta.** Solid build, short dark hair, dark jacket. On foot only.
- **Miloš Zeman.** The reclined heavy figure already in the boat. Keep that pose and the belly. Add grey hair, glasses, and a dark jacket on that figure. If he steps off, the standing person stays the generic rider. Do not add a standing likeness.
- **Jan Kraus.** Average build, short grey hair, glasses, dark jacket. On foot only, and only after the X5 plan has landed. That cabin stays empty.
