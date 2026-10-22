# Stalemates brand

The mark is the **Split King**: one king, two halves, held together only by the crown. Both players, nobody
wins: the name's pun in one glance. Everything in the app's visual language extends from it: a Staunton
silhouette with square steps, one slit, one accent on the other player's half.

## Files

| File                                        | Use                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sm-king-symbol.svg`                        | Symbol master (256 grid, ink, the slit as a real hole). Source of `src/lib/components/brand/BrandMark.svelte`.                                                                     |
| `sm-king-symbol-small.svg`                  | Small-size cut for 16 to 24 px: wider slit, bolder crown, no rim or collar steps. Source of the favicon and the app-icon tiles.                                                    |
| `sm-king-symbol-color.svg` / `-on-dark.svg` | Ink + royal on light; paper + royal on dark. The right half is royal, the left half and the crown are not.                                                                         |
| `sm-king-horizontal*.svg`                   | Primary lockup (ink, colour, on-dark). Used in the README header and the OG image.                                                                                                 |
| `sm-king-stacked*.svg`                      | Stacked lockup for square spaces.                                                                                                                                                  |
| `sm-king-wordmark.svg`                      | "Stalemates" outlined from Poppins Bold, tracking −1 %. Never retype it as artwork; the header sets the name as live text in the same face.                                        |
| `sm-king-tile.svg`                          | Ink square with the small cut in paper + royal: source of `icon-96.png`, `apple-touch-icon.png`, `icon-192.png` and `icon-512.png` in `static/imgs/logo`.                          |
| `sm-king-maskable-tile.svg`                 | Same tile with the mark inside the maskable safe zone: source of `maskable-512.png`.                                                                                               |
| `sm-king-favicon-tile.svg`                  | Small cut in paper on an ink tile: source of `favicon.ico` (16/32/48). The browser-tab SVG (`static/imgs/logo/favicon.svg`) is the small cut alone, ink or paper by colour scheme. |
| `sm-king-og.svg`                            | 1200 × 630 social card (colour lockup on paper): source of `static/imgs/og-image.png`.                                                                                             |

Regenerate the rasters from these sources with any SVG renderer at the sizes named above; `favicon.ico` bundles
the 16, 32 and 48 px renders of the favicon tile.

## Colour

| Name  | HEX                             | Token                        | Use                                           |
| ----- | ------------------------------- | ---------------------------- | --------------------------------------------- |
| Ink   | `#111111`                       | `--foreground` (near enough) | the mark and wordmark on light; app-icon tile |
| Paper | `#FFFFFF`                       | `--background`               | the mark and wordmark on dark                 |
| Royal | `#2563EB` light, `#3B82F6` dark | `--primary`                  | the accent only                               |

Royal marks the other player and nothing else in the mark: the king's right half. Never set the whole mark in
royal outside the one-colour variant, and never put the colour mark on a royal background; use the ink or paper
version there. In the app the mark takes `currentColor` and `fill-primary`, so it follows the theme on its own.

## Type

Poppins (SIL OFL 1.1), already loaded by the app. Wordmark: Bold 700, tracking −1 %. The header sets the name as
live text in Poppins Bold with the same tracking next to the mark.

## Clear space and minimum size

Clear space on every side equals the crown's width (22 % of the symbol height). Minimum sizes: horizontal lockup
120 px, stacked 96 px, symbol 24 px, small cut 16 px.

## Don'ts

Don't stretch, rotate, outline, add gradients or shadows, swap which half is royal, close the slit, change the
lockup ratios, or recreate the wordmark by typing it. Trademark clearance has not been checked.
