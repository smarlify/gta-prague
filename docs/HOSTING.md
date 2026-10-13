# Hosting

Worldhood builds to a **static site**: HTML, JavaScript, fonts and city data, with no game server,
database or accounts. Deploy the contents of `dist/` to a static host. Each player's browser runs
the simulation; a CDN serves the files.

## Downloads and device performance

Building tiles and surface chunks load around the player. Exploring farther downloads more data;
the whole published world is larger than an individual player's first visit. Initial loading also
depends on the selected city, starting point, cache, device and connection.

Earlier October 2026 measurements were roughly 48 MB for Helsinki and 30 MB for Tampere after
a first load and 30-second drive. Those measurements predate the latest terrain, Espoo and
streaming changes, so they are **not current release benchmarks or a per-player traffic promise**.

Before planning capacity, measure the production build with browser developer tools:

1. Disable the network cache, reload a named city/start point and record transferred bytes and
   time until playable. Record the commit, browser and device.
2. Drive a repeatable route for 30 seconds and record the additional bytes.
3. Repeat with a warm cache. Cached content and revalidation depend on the host's headers.

Estimate traffic from these measurements and expected travel, rather than multiplying the total
site size by every player. `public/_headers` supplies cache settings for Cloudflare Pages; other
hosts need equivalent configuration. Compression at the host can reduce JSON and JavaScript
transfers. Already-compressed city packs, images and fonts benefit less.

## Cloudflare Pages

Cloudflare currently describes static asset requests that do not invoke Functions as free and
unlimited on its free and paid plans. This makes Pages suitable for this build. Domains, paid
add-ons, Functions/Workers and storage products have separate costs. Check the actual account
configuration and current terms before deployment.
[Cloudflare's static request pricing](https://developers.cloudflare.com/pages/functions/pricing/)

The Free plan currently allows 20,000 files per site, 25 MiB per file and 500 builds per month.
At the 9 October 2026 review, `public/` contained about 2,400 files; the largest was about 8.4 MiB.
The build adds JavaScript/CSS assets, and new areas change these totals. Verify the final `dist/`
before upload. [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

`tests/hosting.test.mjs` catches several common server-code additions and checks the source asset
size/count with a margin below those limits. It cannot inspect dashboard settings, prevent all
billable changes, or guarantee availability during a traffic spike.

Setup:

1. Connect the GitHub repository to a Pages project.
2. Set the build command to `npm ci && npm run build` and output directory to `dist`.
3. Configure the production branch, preview deployments and custom domain in Pages.
4. Verify HTTPS, caching, all city/start links, and that the published Sources links and
   `/THIRD_PARTY_LICENSES.txt` work.

Only deploy `dist/`. Local credentials, downloaded reference material and development tools are
not deployment inputs. The Vite development and preview commands bind to the local network for
device testing; use a static host for the public game.

## When the world grows

Track repository size, deployed file count, largest assets and actual transfer sizes. The number
of cities alone is a poor capacity measure: a detailed municipal model can outweigh many smaller
areas. If city data outgrows the chosen static host:

1. Move versioned city data to object storage behind a CDN, preserving all source attributions.
2. Point each registry entry's `dataRoot` at its HTTPS data URL. Configure CORS for the game origin.
3. Use immutable caching only for versioned paths; keep registry updates short-lived.
4. Upload through CI with a scoped deployment credential, stored outside the browser bundle.

Cloudflare R2 is one option. Its pricing includes storage and request operations even though
direct egress has no charge; estimate all of them for the workload.
[R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Other static hosts, including GitHub Pages, Netlify, Vercel or an nginx server, can also serve this
build. Compare their current file, bandwidth, build and usage restrictions before choosing one.

## Runtime limits

Static hosting removes the need for a multiplayer simulation server in the current single-player
game. It does not remove browser limits: GPU memory, startup work, texture size and frame rate still
vary across devices. Test representative desktop and phone hardware before promising a frame rate.
Future accounts, shared worlds and persistent territories will need a separate hosting and security
design.

The game uses bundled map data at runtime. OpenStreetMap, Overpass, Nominatim, OSRM and municipal
data services are contacted by contributor build scripts, which cache their results.

## Review on Heroku

The open branch is reviewed on a private Heroku app in the EU region, on the same personal account as Playful and Marooned. It is an Eco dyno. `npm start` serves the Vite build in `dist/` with the `serve` package. Heroku runs `scripts/heroku-build.mjs`, which installs the dev dependencies Vite needs, builds, then removes `public/` because that tree has already been copied into `dist/`.

```sh
git push heroku HEAD:main
```

Cloudflare Pages remains a possible public static host. The Heroku process only serves the built files. It does not add a game server.

## Run it locally

```sh
npm ci
npm run dev                      # development server, usually localhost:5173
npm run build
npm run preview                  # inspect dist/, usually localhost:4173
```
