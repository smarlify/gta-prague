---
name: Prague centre depth
overview: "Leave the extended map aside and deepen the current 2.4 km Prague on origin/main: smooth the real bridges, drop leftover tunnels, plant parks from the shared tree assets, and stop offering the Finland cities."
todos:
  - id: bridge-decks
    content: Smooth Charles Bridge, its approaches, and Hlávkův most; keep water under the deck and stop cars sinking there
    status: in_progress
  - id: strip-tunnels
    content: Remove leftover Tunel roads that are not building passages or short covered ways
    status: pending
  - id: park-planting
    content: Instanced trees and flowers in park polygons, with a hard cap
    status: pending
  - id: charles-statues
    content: Instanced statue row on both parapets of Karlův most
    status: pending
  - id: textures
    content: Plaster house tint, generic ambulance markings, stronger car flake
    status: pending
  - id: drop-finland
    content: Untrack Helsinki/Espoo/Tampere packs without deleting local files; game offers Praha only; reuse shared trees, bushes, and tileable textures
    status: pending
  - id: todo-1792050493599-m2dvffkcw
    content: Do not auto-deploy to Heroku
    status: pending
isProject: false
---

# Deepen the Prague centre

Work from `origin/main` (`67dbf0b`) in [PragueGTA](PragueGTA), on a new branch. Leave [PragueGTA-expand](PragueGTA-expand) and its uncommitted speed changes alone. Do not deploy.

The centre pack is radius 2.4 km. Karlův most is pavement (`Jalkakäytävä (Silta)`), not a road, so the car never gets a bridge height there. Hlávkův most (Florenc to Vltavská) is `Ajorata (Silta)`, but [liftedBridgeHeight](PragueGTA/src/passage.js) only looks 10 m around the car, so a span that sits in the river channel stays at the river bed. Water is then draped up the banks and the car looks sunk.

```1037:1038:PragueGTA/src/main.js
setDriveHeight((x,z)=>{const deck=passageDeck(world.roads,x,z);if(deck!==null)return deck;const road=world.roads.at(x,z);return road&&/Silta|\bmost\b/i.test(`${road.kind} ${road.name}`)?liftedBridgeHeight(groundAt,x,z):groundAt(x,z);});
```

## Bridges, water, and cars

- Drive height for any road or pavement whose kind or name matches `Silta` or `most`, including Karlův most. Use the dry-bank search (about 16–72 m, never more than 8 m above the local bed) so the deck stays with the embankment instead of the channel.
- Blend that height onto the approaches: Mostecká, Křižovnická, and Karlova at Charles Bridge, and the Hlávkův ramps at Florenc and Vltavská, over roughly 40 m so the street does not step.
- Draw a thin deck mesh for those bridges only, above the water. No city-wide bridge lattice.
- Keep the sea in the channel. While draping water, a sample that lands on a bridge uses the nearby open-river level, not the deck. `riverDrop` stays.
- Cars keep stopping in open water. On a bridge deck or its approach they do not. That removes the sink-on-the-bridge behaviour. Driving into the Vltava still stops the car.

## Tunnels

Bored tunnels are already removed at boot (`passage === 'yes'`, 626 roads) in [stripBoredTunnels](PragueGTA/src/passage.js). Also drop roads whose kind or name says Tunel unless they are a `building_passage` or a short `covered` way. No tunnel ceilings, no invisible walls. Do not try to make Letná or Mrázovka drivable.

## Parks

[public/cities/prague/landcover.json](PragueGTA/public/cities/prague/landcover.json) is empty. The pack has 3,418 parks (mostly lawn) and trees only at a few hand-placed groves in [prague-scenery.js](PragueGTA/src/prague-scenery.js). Scatter instanced trees and a few low flowers into park polygons above a small area, with a hard cap (on the order of a few hundred trees and about a thousand flowers) so this stays one or two instanced meshes. Skip parks that already contain a registered tree. Crowns come from the existing families in [tree-species.js](PragueGTA/src/tree-species.js) (lime, maple, birch, cherry), plus a short wide bush built from the same crown lumps.

## Charles Bridge statues

A row of simple original stone figures along both parapets of the Karlův most pavement, one instanced mesh. Not scans or copies of the real statues.

## Textures

Asphalt, grass, and car flake are already loaded in [surface-textures.js](PragueGTA/src/surface-textures.js). This pass adds:

- A small repeating plaster tint on Prague house walls (the plaster flag is already set). No photo façade atlases.
- A clearer generic ambulance in [pavlova-scene.js](PragueGTA/src/pavlova-scene.js): white van, red stripe, a cross. Not a real service name.
- Slightly stronger car clearcoat using the existing flake map. No badges.

## Finland cities

The running game still offers Praha only. `?city=helsinki` and `?city=tampere` say the city is not in this build. Drop Tampere from the committed [public/cities/index.json](PragueGTA/public/cities/index.json). Stop booting Helsinki and the Espoo extension (remove Helsinki from the selectable `CITIES` map in [src/cities.js](PragueGTA/src/cities.js), or equivalent so `selectCity` rejects them). Update [tests/cities.test.mjs](PragueGTA/tests/cities.test.mjs) so those URLs are rejected. Keep a local fixture in the start-url test if it only needs a city object for `startUrl` / `dataUrl`; do not require Helsinki to be selectable.

Keep the local working copies. Do not delete files. Helsinki lives in `PragueGTA/public/data` (about 208 MB, Espoo under `public/data/extensions`). Tampere lives in `PragueGTA/public/cities/tampere` (about 21 MB).

Remove those paths from git with `git rm -r --cached` (index only; the working tree stays) and add them to `PragueGTA/.gitignore` so they are not re-added and a Heroku deploy does not upload them.

Tests that read the Helsinki pack must skip when the fixture is absent, so a clean clone and CI stay green. Machines that still have the files keep running those tests. Do not rewrite the Helsinki scenery suite.

Shared art stays in git and is used in Prague: tree families and a short bush crown in [src/tree-species.js](PragueGTA/src/tree-species.js), tileable maps in [public/textures](PragueGTA/public/textures), and [public/models](PragueGTA/public/models) that are not a Helsinki landmark. Helsinki’s 805 façade JPEGs in `public/data/buildings3d` are UV atlases for those buildings; they are not stretched onto Prague walls. They leave git with the Helsinki pack and remain on disk locally.

## Later

Building footprints that follow the real outline more closely, and a unique texture on every prop, stay out of this branch. Those are the two nice-to-haves.

## Check

Locally, from `origin/main`: drive Karlův most from Mostecká onto Křižovnická without dropping into the river, and Hlávkův most from Florenc toward Vltavská the same way. Water stays under the deck. A named tunnel does not stop the car. A park shows trees. The start screen still reaches Ready. No Heroku push.
