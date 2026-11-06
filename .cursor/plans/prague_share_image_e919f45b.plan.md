---
name: Prague share image
overview: Facebook, LinkedIn, and Instagram still receive the Worldhood Helsinki splash. Replace that picture with a GTA Praha still and point the share tags at it.
todos:
  - id: capture-og
    content: Replace public/og-image.jpg with a 1200×630 GTA Praha / Prague still
    status: pending
  - id: retarget-tags
    content: Point index.html and about/index.html og:image and twitter:image at https://gtapraha.online/og-image.jpg
    status: pending
isProject: false
---

# Prague share image

The picture in the share card is [public/og-image.jpg](PragueGTA/public/og-image.jpg): a 1200×630 JPEG of the Worldhood welcome card over Helsinki harbour, starting at Olympia Terminal. The tags do not even use that file. [index.html](PragueGTA/index.html) and [public/about/index.html](PragueGTA/public/about/index.html) set `og:image` to `https://worldhood.org/og-image.jpg`, and the alt text still describes Market Square and Uspenski Cathedral.

## Image

Replace `public/og-image.jpg` with a new 1200×630 JPEG of this game. Capture the welcome view at Petřín on the review app so the card reads GTA Praha and the city behind it is Prague. Keep the boot card in the frame if it is the GTA Praha one. Do not keep the Worldhood wordmark, “Check out some hoods”, Olympia Terminal, or the Helsinki harbour.

## Tags

In both HTML files:

- `og:image` becomes `https://gtapraha.online/og-image.jpg`
- Keep width 1200 and height 630
- Alt text names GTA Praha and Prague
- Add `twitter:image` with the same URL (the card type is already `summary_large_image`)

Title and description already say GTA Praha. Leave them.

Facebook, LinkedIn, and Instagram link previews all read these Open Graph tags. Pointing them at a new URL on gtapraha.online drops the cached Worldhood picture. After deploy, refresh Facebook’s Sharing Debugger and LinkedIn’s Post Inspector once so they fetch the new file.

Branch from current `main`. Do not touch `city/prague-expand`. Do not rewrite the in-game help copy in this pass.
