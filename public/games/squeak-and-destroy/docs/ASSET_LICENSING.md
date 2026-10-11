# Asset licensing — what was removed and why

Squeak & Destroy was closed-source for its first five years of versions, and it
picked up art along the way under licences that allow **use** but forbid
**redistribution**. A public git repository is redistribution, so those files are
not here.

**The game runs without them.** Every removed file has a code-drawn or emoji
fallback that was already in the engine — nothing crashes, nothing 404s in a way
the game does not handle.

## Removed

| Path | Count | Source | Why |
|---|---|---|---|
| `assets/species/*.png` | 7 | Freepik / Flaticon | Free License permits use, not redistribution of the files |
| `assets/bg/**` | 55 | LudicArts, CraftPix (purchased packs) | Per-seat commercial licences, redistribution prohibited |
| `assets/boxes/*.png` | 3 | Flaticon | as above |
| `assets/ui/*.png` | 4 | Flaticon | as above (the four `.svg` files are ours and stay) |
| `assets/weapons/*.png` | 20 of 31 | Flaticon | as above — the 11 flat-white game-icons.net ones stay |
| `assets/fx/*.png` | 2 | unverified | provenance not documented; removed pending an audit |
| `assets/maps/*.jpg` | 13 | generated | in-game previews that bake in the removed backgrounds |
| `assets/john.jpg` | 1 | photograph | a photo of a real person does not belong in a public repo |
| `assets/trailer.mp4` | 1 | ours | 3.4 MB of marketing video, not needed to run the game |

How the icons were separated: the game-icons.net set is pure white plus alpha,
the Flaticon set is full-colour. `tools/` has no classifier for this — the split
was made by sampling opaque pixels for hue, and it is recorded here so the same
rule can be re-applied if the art is ever re-imported.

## What it looks like without them

- **Species art** — the HUD roster and menu avatars use `CA.speciesIcon(id)`,
  which falls back to the code-drawn animal. Units on the battlefield were
  *always* code-drawn, so gameplay is visually unchanged.
- **Backgrounds** — `fx.js` `renderBg()` falls back to its procedural parallax
  (layered hills, atmospheric haze, per-theme accents). This is the look the game
  shipped with before the painted packs were bought.
- **Weapon icons** — `ui.js` draws the emoji glyph when the PNG is absent.
- **Mystery boxes** — drawn as shapes by `weapons.js`.

## If you are the maintainer restoring the art locally

The paths above are in `.gitignore`. Drop the licensed files back in and they
will be picked up automatically — no code change, no build step. Just never
`git add -f` them.

## If you are a contributor who wants to fill the gaps

Replacement art is very welcome, and it is probably the highest-value
contribution to the project right now. Requirements:

- **CC0, CC BY, or your own work** offered under CC BY-NC 4.0 (see
  [LICENSE-ASSETS.md](../LICENSE-ASSETS.md)). Nothing from Freepik, Flaticon,
  CraftPix, LudicArts or any other use-only marketplace.
- Add the source and licence to [ATTRIBUTIONS.md](../ATTRIBUTIONS.md) **and** to
  the Credits screen in `js/menu-credits.js`.
- Register new files in `sw.js` `PRECACHE` so they work offline.

Good sources: [Kenney.nl](https://kenney.nl) (CC0), [game-icons.net](https://game-icons.net)
(CC BY 3.0), [OpenGameArt](https://opengameart.org), [ambientCG](https://ambientcg.com) (CC0).
