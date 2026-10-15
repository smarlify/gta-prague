---
name: Skip Finland tests
overview: The pre-push suite still runs Helsinki, Espoo, and Tampere tests whenever those packs are on disk. Mark those cases skipped so `npm test` only exercises the shared engine and Prague.
todos:
  - id: skip-pack-tests
    content: Always skip tests that read public/data or public/cities/tampere, including mixed files
    status: in_progress
  - id: skip-finland-logic
    content: Skip Digiroad, harbour-sign, Kauppatori fingerpost, and city-hall flag tests
    status: pending
  - id: verify-suite
    content: Run npm test and confirm Prague and engine tests still pass
    status: pending
isProject: false
---

# Skip Finland tests

`npm test` is `node --test tests/*.test.mjs` ([package.json](PragueGTA/package.json)). On the last push all 740 tests passed because `public/data` and `public/cities/tampere` are still on this machine. The existing guards are `skip: !existsSync('public/data')` or `if (!existsSync('public/data'))`, so they only skip on a clean clone.

Work on `feature/prague-centre-depth` (pull request #21). Do not deploy.

## What to skip

Skip a test when it reads a Finland pack or only asserts a Finland place:

- The ~47 files that load `public/data` or `public/cities/tampere`. Where the whole file sits inside `if (!existsSync('public/data'))` (for example [tests/mobility.test.mjs](PragueGTA/tests/mobility.test.mjs)), take the skip branch always. Where only some cases read the pack (for example the landmark and aerial tests at the bottom of [tests/physics.test.mjs](PragueGTA/tests/physics.test.mjs)), skip those cases only.
- Finland logic that never opens the pack: [tests/digiroad-signs.test.mjs](PragueGTA/tests/digiroad-signs.test.mjs), [tests/harbour-sign-evidence.test.mjs](PragueGTA/tests/harbour-sign-evidence.test.mjs), [tests/kauppatori-fingerpost.test.mjs](PragueGTA/tests/kauppatori-fingerpost.test.mjs), [tests/city-hall-flag.test.mjs](PragueGTA/tests/city-hall-flag.test.mjs).

Use one skip reason, `Finland city is not part of this build`, so the report lists them as skipped rather than deleting the files.

## What stays

- Synthetic engine tests in mixed files: physics driving, sea mesh, extension graph joining, slug and start matching.
- [tests/cities.test.mjs](PragueGTA/tests/cities.test.mjs). It checks that `?city=helsinki` and `?city=tampere` are rejected.
- The Prague files: `prague-bridges`, `prague-buildings`, `prague-passage`, `prague-scenery`, `prague-wider`.

## Check

Run `npm test` and confirm the Finland cases are skipped, the Prague and engine cases still pass, and nothing reads `public/data` during the run. Commit and push so pull request #21 updates. Leave Heroku on the current release.
