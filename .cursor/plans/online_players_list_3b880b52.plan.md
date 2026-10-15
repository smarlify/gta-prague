---
name: Online players list
overview: Clicking Online while you are in the room opens the list of players already in the snapshot. It no longer leaves the room.
todos:
  - id: branch
    content: Branch feature/online-players from the latest feature/prague-live-weather
    status: pending
  - id: list
    content: Open the room snapshot as a player list instead of leaving the room
    status: pending
  - id: ship
    content: Test the click, push, open the PR, and deploy the branch
    status: pending
isProject: false
---

# Online players list

Branch `feature/online-players` from the latest `feature/prague-live-weather` in [PragueGTA](PragueGTA), so it includes the live clock and the daytime/weather split if that commit has landed. Do not edit weather logic. Do not touch the expand worktree. Open a pull request and deploy the branch to the review host. Do not merge.

## What happens now

[src/net/online-hud.js](PragueGTA/src/net/online-hud.js) treats a click on `#online-btn` as a toggle. While the label reads `Online · N`, the click calls `onGoOffline` and leaves the demo room. The names are already on the room: `PresenceRoom.players` in [src/net/room.js](PragueGTA/src/net/room.js), each row’s `name` from [src/net/protocol.js](PragueGTA/src/net/protocol.js).

## Click opens the list

While online, the click opens a small panel under the button and does not call `leave`. Clicking the button again, or outside the panel, closes it. The panel lists every player in the current snapshot, including you, using the presence name (fallback `Driver`). Your row is marked so the count matches `Online · N`. No extra Firebase read.

While the label reads `Go online`, the click still rejoins, as it does now. There is no offline control on this button.

## Check

A test with a fake document: an online click does not call `onGoOffline` and the panel text contains the snapshot names. An offline click still calls `onGoOnline`. Finland stays skipped.
