---
name: Prague billboard ads
overview: Scatter a fixed set of placeholder billboards through Prague, then let an advertiser pay a one-time fee plus a credit pack and put one image on a board. Stripe Checkout is the payment path because it can charge CZK, EUR, USD, CHF, GBP, JPY, and PLN without a second integration.
todos:
  - id: prague-boards
    content: Add a stable scatter of Prague billboards with the Czech and English placeholder, and keep the Helsinki Bind boards off this path.
    status: completed
  - id: stripe-packs
    content: Sell the fee-plus-40 pack and later 40-credit top-ups in CZK, EUR, USD, GBP, CHF, PLN, and JPY through Stripe Checkout.
    status: completed
  - id: advertiser-page
    content: Add a Google-signed-in page with spent and remaining credits, image upload, and an add-credits button.
    status: completed
  - id: paint-paid-faces
    content: Paint one live creative per board per Prague day, and restore the placeholder when credits run out.
    status: completed
isProject: false
---

# Prague billboard ads

Branch off current `origin/main`. Open a pull request. Do not merge it. The extended-map draft stays untouched.

## Payment

Stripe Checkout. A webhook adds the credits. Card, Apple Pay, and Google Pay come with it, and the payout can still land in the Fio account.

Fio alone would be a bank transfer the player has to match by hand. Revolut would be a second merchant integration for the same card checkout. Crypto does not price a pack in CZK or JPY. None of those three is the first version.

Credits are a count, not a balance in six currencies. Every pack buys the same 40 credits. The player picks the currency at checkout. There is no live conversion.

Suggested pack prices, easy to edit before launch:

- CZK 250 fee + 1 000 for 40 credits
- EUR 10 + 40
- USD 10 + 40
- GBP 8 + 32
- CHF 9 + 36
- PLN 40 + 160
- JPY 1 500 + 6 000

The first paid checkout is the fee plus the credit pack. Later checkouts are another 40 credits and do not charge the fee again. One credit puts that advertiser's image on one board for one Prague day. When the balance hits zero, the board goes back to the placeholder. Picking a particular board is later.

## What appears in the city

Prague currently takes the empty ad group from `genericScenery` in [src/main.js](PragueGTA/src/main.js). The Helsinki Bind boards in [src/bind-ads.js](PragueGTA/src/bind-ads.js) stay on the Helsinki path only.

Add a Prague module that builds about 16 freestanding boards. Positions are chosen once, beside the road on pavement, clear of buildings, and then stored. They do not move between visits. A scatter seed makes them feel placed around the centre rather than on a grid.

Each empty face is a canvas with two lines:

- Zde může být vaše reklama
- Your ad can be here

The posts are solid obstacles, same idea as the freestanding board already in `bind-ads.js`. A paid image replaces the whole face. It is a landscape jpeg, png, or webp, capped in file size, cropped to the board. With no live creative, the placeholder stays.

Which paid image lands on which board is shuffled once per Prague day. Two advertisers use two boards. The rest stay placeholders.

## Advertiser page

A page on the same site, not a panel inside the driving view. Sign-in is the Google provider already created in [src/firebase.js](PragueGTA/src/firebase.js). The anonymous multiplayer session stays separate.

The page shows spent credits, remaining credits, the uploaded image, and an "add credits" button that opens Checkout in the chosen currency. The image and the credit ledger live in the existing Firebase project (Storage for the file, Firestore for the account). The game reads a small public list of creatives that still have credits.

The Heroku app only serves the built site, so the Stripe webhook is a Firebase Cloud Function. Checkout success does not add credits from the browser.

An image with credits goes up without a review queue. Taking one down stays a manual Firebase edit for now.

## Tests

Cover the placeholder lines, a board that is not inside a building, a first purchase that grants 40 credits after the fee, a top-up that does not charge the fee again, and a board returning to the placeholder at zero credits. The currency only changes the Checkout price, not the credit count.
