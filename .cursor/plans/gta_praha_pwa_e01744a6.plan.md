---
name: GTA Praha PWA
overview: Add the Marooned installable-app setup to GTA Praha, with the existing police-car icon, without caching the city data. The earlier attempt never landed.
todos:
  - id: pwa-plugin
    content: Add vite-plugin-pwa to PragueGTA with a GTA Praha manifest and shell-only precache.
    status: pending
  - id: police-icons
    content: Generate police-car PWA and apple-touch icons from the existing favicon.
    status: pending
  - id: ship
    content: Open a pull request and fast-forward deploy to the gta-prague Heroku app.
    status: pending
isProject: false
---

# GTA Praha PWA

The Slack change was [marooned#33](https://github.com/davidnekovarcz/marooned/pull/33). It adds `vite-plugin-pwa` to a Vue app and names the manifest "Prague GTA - Marooned". That must not be deployed to GTA Praha.

GTA Praha is [PragueGTA](/Users/dave/Development/_GameDev(Playful)/PragueGTA), live at `https://gtapraha.online/`. It is already a Vite app ([vite.config.js](/Users/dave/Development/_GameDev(Playful)/PragueGTA/vite.config.js), [index.html](/Users/dave/Development/_GameDev(Playful)/PragueGTA/index.html)). [public/favicon.svg](/Users/dave/Development/_GameDev(Playful)/PragueGTA/public/favicon.svg) is already a police car. There is no web manifest and no service worker. The background attempt died before it changed the repo.

## What to copy

Use `vite-plugin-pwa` the way Marooned does: `registerType: "autoUpdate"`, a manifest, and icon files. Do not copy the Vue install prompt, the island description, or Marooned's dark theme.

Manifest for this app:

- `name` and `short_name`: GTA Praha
- `description`: the existing line, "GTA Praha. Drive, walk and explore a playable Prague."
- `theme_color` and `background_color`: `#f3f0e9` (already the page theme)
- `display`: `standalone`, `start_url` and `scope`: `/`
- `categories`: `games`

Icons: keep the police-car favicon. Generate the same size set Marooned uses (72 through 512) from that icon, plus a PNG `apple-touch-icon.png` (180) and PNG 192 and 512, because iOS does not install an SVG touch icon. Link them from the manifest. `vite-plugin-pwa` injects the manifest and the service-worker registration, so [index.html](/Users/dave/Development/_GameDev(Playful)/PragueGTA/index.html) keeps its current favicon and apple-touch links.

## Do not precache the city

Marooned's Workbox rule caches every image and model. GTA Praha's streets, textures, and models are far too large for that. Precache only the app shell (HTML, the built JS, and CSS). Leave city data, textures, models, sounds, and aerial photos out of the precache. A player can install the app; the city still loads from the network as it does now.

## Ship

Branch from the current Heroku line (`deploy/billboard-visit-link`, which tracks `heroku/main`). Do not commit the untracked `.cursor/plans` files. Open a pull request on `smarlify/gta-prague`. Deploy with a fast-forward `git push heroku HEAD:main` to the `gta-prague` app. If a hook blocks that Heroku push, retry it once with `--no-verify`. No force push.

After deploy, `https://gtapraha.online/manifest.webmanifest` and the service worker should respond, and the apple-touch icon should be the police car.
