# Third-party data and assets

The code is MIT-licensed (see [LICENSE](LICENSE)). The data and assets below keep their own licences.
Redistributions must keep these attributions. The game also shows them in its Sources panel.

The built game includes [third-party software and font notices](public/THIRD_PARTY_LICENSES.txt),
served at `/THIRD_PARTY_LICENSES.txt`. Keep that file with a redistributed build. After changing
dependencies, run `npm ci` and `node scripts/third-party-licenses.mjs`; the normal test suite checks
that the notices match the locked runtime packages and bundled fonts.

## At a glance

| What | Licence | Files |
| --- | --- | --- |
| Source code, scripts, tests, docs | MIT | `src/`, `scripts/`, `tests/`, `docs/` |
| Original assets made for this project (procedural models, `senate-pavilions` model and source) | MIT | `public/models/senate-pavilions.glb`, `assets/source/` |
| City of Helsinki map, 3D and imagery data | CC BY 4.0 | most of `public/data/` |
| City of Espoo 3D city model (CityGML LOD2 with 2024 photo textures), street areas, centrelines, trees, park register areas and districts | CC BY 4.0, © Espoon kaupunki | `public/data/extensions/espoo/` (except `osm-water.json`, `osm-landcover.json` and `surfaces/osm-*`) |
| Traffic lights, speed limits and lane counts in the Espoo area from Digiroad (Väylävirasto) | CC BY 4.0 | `public/data/extensions/espoo/mobility.json` |
| Sea and pond outlines in the Espoo area from OpenStreetMap | ODbL 1.0, © OpenStreetMap contributors | `public/data/extensions/espoo/osm-water.json` |
| Land cover (lawns, woods, scrub, pitches) in the Espoo area outside the park register, from OpenStreetMap | ODbL 1.0, © OpenStreetMap contributors | `public/data/extensions/espoo/osm-landcover.json` and its surfaces `public/data/extensions/espoo/surfaces/osm-*` |
| HSL transit data | CC BY 4.0 | `public/data/trams.json`, `buses.json`, `bus-corridors.json` |
| OpenStreetMap-derived route outlines and landmark positions | ODbL 1.0 | `extensions/*/route.json`, `knownFor[].at` in `extensions/*/extension.json` |
| Cities built from OpenStreetMap (`npm run city:build`) | ODbL 1.0, © OpenStreetMap contributors | `public/cities/**`, `cities/*/city.json` |
| Prague building shells (`npm run prague:buildings`) from IPR Praha's photogrammetric 3D model, read from the public I3S scene layer of the same model published as CityGML | CC BY 4.0, datový podklad © IPR Praha | `public/cities/prague/buildings3d/**`, `public/cities/prague/buildings3d-index.json` |
| City, crowd, car, tram and police recordings (short excerpts) | CC0 1.0 | `public/sounds/` |
| Road, ground and car-paint flake textures from Poly Haven | CC0 1.0 | `public/textures/` |
| Street furniture positions extracted by Mapillary (`npm run city:furniture`) | Mapillary Terms of Use; downstream dataset redistribution rights need confirmation | Mapillary-derived entries in `public/cities/*/furniture.json` |
| Façade descriptions written from Mapillary street-level photos (`npm run facades:photos`) | CC BY-SA 4.0, © Mapillary contributors | `cities/*/facades.json`, `public/cities/*/facades.json` |
| Place descriptions written from current photos on Wikimedia Commons and Mapillary (`npm run photos:fetch`) | CC BY-SA 4.0 (the photos' licences: CC BY-SA 3.0/4.0) | `cities/*/*-reference.json`, `cities/*/*-sources.json` |
| Rectified photo textures of walls and paving (`npm run place:textures`), derived from the CC BY-SA 4.0 photos listed in the sources file | CC BY-SA 4.0, © the photographers (JIP, kallerna, MOs810 on Wikimedia Commons) | `public/cities/*/places/*/*.jpg` |
| City of Tampere open data (3D building parts, street parts, tree register, stops) used by `npm run place:build` | CC BY 4.0 | `public/cities/tampere/places/*.json` |
| Traffic signs, traffic lights, stops and regulation stretches from Digiroad (Finnish Transport Infrastructure Agency, Väylävirasto), used by `npm run city:furniture` for Finnish cities | CC BY 4.0 | `public/cities/*/furniture.json` |
| City of Tampere open data (pedestrian crossings, signalled junctions, public transport stops) used by `npm run city:furniture` | CC BY 4.0 | `public/cities/tampere/furniture.json` |
| Ground elevation (hills, lake and river levels) from the National Land Survey of Finland's Elevation model 2 m, via Mapterhorn terrain tiles, used by `npm run city:terrain` | CC BY 4.0 | `public/cities/*/terrain.pack` |
| Original worldhood logo artwork and favicon | MIT (font files retain their own licences) | `public/branding/worldhood-*.svg`, `public/favicon.svg` |
| Bundled interface typefaces | SIL Open Font License 1.1; notices alongside each font | `public/fonts/` |
| Helvetiker, Optimer and Gentilis typefaces for 3D signs | MgOpen font licence (Helvetiker/Optimer); SIL OFL 1.1 (Gentilis) | Imported from `three/examples/fonts`; full notices in `public/THIRD_PARTY_LICENSES.txt` |
| Bundled JavaScript libraries | MIT, ISC and Unlicense; individual notices apply | `public/THIRD_PARTY_LICENSES.txt` |
| Third-party marks | Not licensed by this project | `public/branding/bind-logo.svg` |
| Official Mapillary attribution logo | Mapillary Terms of Use; trademark retained by its owner | `public/branding/mapillary-logo.png`; provenance in `mapillary-source.json` |

**Forking for another city?** Keep the MIT notice for the code, replace `public/data` with your own
city's data under its licence, and update this file and the in-game Sources panel.

## Sound recordings

- **City beds** from [BigSoundBank](https://bigsoundbank.com) (La Sonothèque), dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The game ships short excerpts, trimmed and faded so they can loop: a street (`s0608`, Joseph SARDIN), a pedestrian street (`s2676`, Pierre SIBANARCO), a car interior at 50 km/h (`s3099`, Joseph SARDIN & Axeline T.), a tram passing (`s3372`, Joseph SARDIN & Axeline T.), a tram leaving a stop (`s3538`, Joseph SARDIN) and a French two-tone siren (`s0886`, Joseph SARDIN). CC0 does not require this credit. Page URLs are in `public/sounds/sources.json`.

## Map and city data

- **City of Helsinki open geographic data and Helsinki 3D:** building footprints, textured LOD2 models,
  streets, pavements, parks, trees, coastline, traffic lanes and signals, and 2025 orthophotos.
  © City of Helsinki, City Survey Services / Urban Environment Division, licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Machine-readable provenance: `public/data/provenance.json` and `public/data/extensions/index.json`.
- **City of Espoo, city model data, fetched 9 October 2026:** © City of Espoo
  (Espoon kaupunki), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  The Espoo extension uses the open aboveground CityGML city model and its façade/roof photographs,
  street areas, centrelines, registered trees, park register areas and district boundaries. Building bases are levelled,
  photo textures are repacked into atlases, and geometry is cropped for the game. See
  [Espoo's data and attribution terms](https://www.espoo.fi/en/open-data-of-the-geographic-information-unit)
  and the per-extension provenance in `public/data/extensions/index.json`.
  The Keilaniemi, Otaniemi and Tapiola coverage uses CityGML 2.0 LOD2 with 2024 oblique-aerial
  façade and orthophoto roof textures (`bldg:building_lod2`), street areas (`tran:road_lod2`),
  centrelines (`GIS:Keskilinjat`), trees (`kanta:Lehtipuu`, `kanta:Havupuu`), park register areas (`GIS:InfPark`) and districts
  (`GIS:Kaupunginosat`) from kartat.espoo.fi/teklaogcweb/wfs.ashx.
  Its traffic lights, speed limits and lane counts come from Digiroad (CC BY 4.0); its coastline and
  water polygons and the land cover outside the park register are derived from © OpenStreetMap
  contributors ([ODbL 1.0](https://www.openstreetmap.org/copyright)), with source geometry retained in
  `public/data/extensions/espoo/osm-water.json` and `osm-landcover.json`.
  Forest trees inside mapped woods are inferred, not surveyed.
- **HSL public transport data** (GTFS routes and stops for trams and buses): © HSL, licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `public/models/tram-sources.json`
  and `public/models/bus-sources.json`.
- **HSL city-bike station positions:** from the public station feed. See
  `src/parked-micromobility.js`.
- **Digiroad** (traffic signs, traffic lights, public transport stops, speed limits, vehicle
  restrictions and bus lanes; `npm run city:furniture`): © Finnish Transport Infrastructure Agency
  (Väylävirasto), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from the open
  interface at avoinapi.vaylapilvi.fi. Sign faces are drawn by the game from the sign descriptions; no
  sign artwork is copied.
- **City of Tampere open data** (pedestrian crossings, signalled junctions, bus and tram stops from
  geodata.tampere.fi; `npm run city:furniture`): © City of Tampere, licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Elevation** (`npm run city:terrain`; hills, lake and river levels): Finnish cities use the
  [Elevation model 2 m](https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m)
  © National Land Survey of Finland, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
  read from the keyless [Mapterhorn](https://mapterhorn.com) terrain tiles (terrarium encoding; see
  mapterhorn.com/attribution for the source of each area). Resampled to a 3 m grid, smoothed along
  streets and levelled on water.
- **Extension crop outlines and route centrelines:** derived from OpenStreetMap via OSRM and Nominatim.
  © OpenStreetMap contributors, licensed [ODbL](https://opendatacommons.org/licenses/odbl/).
  Used only to choose which municipal data to include.

- **Mapillary street-level imagery**: photos stay on Mapillary (downloads by `npm run photos:fetch` and
  `facades:photos` go to the git-ignored `data/raw/`). Written observations in `extensions/*/reference-notes.json` credit each image ID
  and photographer. Mapillary imagery is licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- **Mapillary street-level photos for façades** (`npm run facades:photos`): photos are downloaded
  only to the git-ignored `data/raw/mapillary/` for looking at and are never committed. Colours,
  storeys, window rhythm and shop-front types are written in our own words into
  `cities/*/facades.json`, which lists the image ids and capture dates used per building.
  © Mapillary contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/);
  `facades.json` is shared under the same licence. The city's Sources panel credits Mapillary.
- **Mapillary map features** (cities built with a `MAPILLARY_TOKEN`): positions and types of lamp
  posts, traffic lights, road signs, bins, junction boxes and other street furniture that Mapillary's
  computer vision detected in contributors' street-level photos, filtered and moved off the carriageway
  by `scripts/mapillary-features.mjs`. Each object in `public/cities/*/furniture.json` lists the
  Mapillary map feature ids it came from. These extracted features are distinct from user-uploaded
  imagery: the imagery's CC BY-SA licence alone does not establish a redistribution licence for
  Mapillary's extracted data. [Mapillary's Terms of Use](https://www.mapillary.com/terms), sections
  3 and 11, govern this integration and require a visible Mapillary logo linked to its homepage.
  **Before public dataset distribution, confirm the downstream redistribution rights for these
  entries.** Adding the required attribution addresses the credit requirement; it does not by
  itself resolve that licence question. Municipal and OSM entries in the same file retain their
  separately stated licences. [Mapillary's official map-data guidance](https://help.mapillary.com/hc/en-us/articles/4407521157138-Downloading-map-data-via-the-Mapillary-web-app)

- **Reference photos for places** (`npm run photos:fetch`, e.g. Keskustori in Tampere): current
  photos from Wikimedia Commons (each under its own licence, mostly CC BY-SA 4.0) and Mapillary
  (CC BY-SA 4.0) are downloaded only to the git-ignored `data/raw/photos/` for looking at and are
  never committed. A few of them are rectified (perspective-corrected) into wall and paving textures
  (`npm run place:textures`, `public/cities/*/places/<place>/*.jpg`); those textures are derivatives
  of CC BY-SA 4.0 photos and are shared under CC BY-SA 4.0 with the photographer credited (the
  sources file lists which photo each texture comes from). Everything else about the square's paving, trees, tram stop, lamps and landmarks are
  described in our own words in `cities/*/<place>-reference.json`; every photo used is listed with its
  author, licence, capture date and use in `cities/*/<place>-sources.json`. Keskustori credits:
  JIP, Drefer, kallerna, MOs810, Piquito and Tiia Monto (Wikimedia Commons) and jopparn (Mapillary).
  The reference files are shared under CC BY-SA 4.0. Google imagery is never used.
- **City of Tampere open data** for places: 3D building parts (heights), street parts (paving areas),
  the tree register (species, height class, girth) and public transport stops from
  geodata.tampere.fi, © City of Tampere, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Assets

- **Granite material:** [Poly Haven Granite Tile 03](https://polyhaven.com/a/granite_tile_03), CC0.
- **Road, ground and paint textures:** Poly Haven maps under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/):
  [Asphalt 02](https://polyhaven.com/a/asphalt_02) (Rob Tuytel) for carriageways,
  [Grass Ground](https://polyhaven.com/a/grass_ground) (Charlotte Baglioni) for the terrain plane,
  and a resized roughness crop of [Metal Plate](https://polyhaven.com/a/metal_plate) (Rob Tuytel) as
  a subtle car-paint flake. Page URLs are in `public/textures/sources.json`.
- **Route trees:** [EZ-Tree](https://github.com/dgreenheck/ez-tree) by Daniel Greenheck, MIT. See
  `public/models/tree-credits.txt`.
- **Landmark references:** the per-landmark source files in `public/models/*-sources.json` list
  references, licences and what is measured versus interpreted. Reference photographs are not
  embedded in the game.

## Fonts

The interface bundles DM Sans, Manrope and Spectral locally. Their SIL Open Font License notices
are included with the files under `public/fonts/`. Playing the game does not request fonts from Google.

The game's 3D signs also use the Helvetiker, Optimer and Gentilis example typefaces distributed
with three.js. Their original font notices are preserved in `public/THIRD_PARTY_LICENSES.txt`;
they do not become MIT-licensed because the surrounding game code is MIT-licensed.

## Logos

The original worldhood globe, city highlight and wordmark artwork are included under the project’s
MIT licence. Embedded text outlines do not change the licences of the separately distributed fonts.

- `public/branding/bind-logo.svg`: the Bind wordmark ([bindlegal.com](https://bindlegal.com/)), used for
  fictional in-game advertising with permission. It is a trademark of Bind and is not covered by this
  project's licence.
- `public/branding/mapillary-logo.png`: unmodified official artwork from the
  [Mapillary press kit](https://www.mapillary.com/press-kit), displayed with its homepage link to
  attribute integrated Mapillary data as required by section 11 of its Terms of Use. The mark
  remains its owner's trademark; it is not covered by this project's MIT licence.

If you fork this project, replace or remove the Bind logo unless you have your own
permission. Retain the required Mapillary attribution if you retain Mapillary-derived content,
and check the applicable data rights separately.
