---
name: Prague tab titles
overview: Change the browser tab from “most Legií — GTA Praha” to “GTA Praha 1 - most Legií 🇨🇿”, using the district number already on the Prague area anchors. The on-screen wordmark stays “🚔 GTA Praha 🇨🇿”.
todos:
  - id: title-format
    content: Format the tab as GTA Praha {n} - {street} with the Czech flag, leaving the on-screen wordmark alone
    status: pending
  - id: district-number
    content: Pass the Praha number from the nearest area anchor, not the uppercased minimap caption
    status: pending
isProject: false
---

# Prague tab titles

The tab is set in [src/worldhood-brand.js](PragueGTA/src/worldhood-brand.js) as `{street} — GTA Praha`. The on-screen wordmark in [index.html](PragueGTA/index.html) is already `🚔 GTA Praha 🇨🇿` and stays that way. No police emoji on the tab.

New tab shape, flag at the end:

- On a named street: `GTA Praha 1 - most Legií 🇨🇿`
- Same pattern elsewhere: `GTA Praha 8 - Vltavská 🇨🇿`
- Before a street is known: `GTA Praha 🇨🇿` (the current HTML title)

The number comes from the nearest anchor in [src/area-caption.js](PragueGTA/src/area-caption.js), which already says `Praha 1 - Malá Strana`, `Praha 8 - Karlín`, and so on. Take only the number. The words after the hyphen in the tab are the road or pavement name from `updateHUD` in [src/main.js](PragueGTA/src/main.js), not the uppercased minimap caption (`PRAHA 1 - STARÉ MĚSTO`). The minimap caption is unchanged.

Vltavská sits on the Holešovice / Karlín line. Holešovice is Praha 7 in these anchors and Karlín is Praha 8, so the tab uses whichever anchor is nearer. most Legií falls in Praha 1.

Add a small test for `locationPageTitle`. Work on a new branch from current `origin/feature/prague-centre-depth`. Do not deploy.
