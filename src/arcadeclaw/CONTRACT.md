# Arcade Claw -- build contract (3 lanes, one self-contained page)

Reference: the pixel-art picture the user sent in the conversation ("ARCADE CLAW" cabinet, 572x1024). Reproduce it as
closely as possible ("pixel perfect"), at a BASE RESOLUTION of 192 x 342 logical pixels (the reference is ~3x that).
Remove the 3 floating things (star + 2 UFOs). Machine texts stay English (ARCADE CLAW, CREDITS, GRAB, 1 COIN = 1 PLAY);
everything outside the machine is translated EN/ES/DE. Names: folder `arcadeclaw`, "Arcade Claw" / es "Máquina de Gancho"
/ de "Greifautomat".

## Files (each lane owns ONLY its files)
| File | Lane | What |
|---|---|---|
| `src/arcadeclaw/parts/art.js` | ART | cabinet, marquee, glass + reflections, gantry, cable, claw, chute box, control panel (joystick, GRAB, credits LEDs, coin slot + label), animated arcade background (machines blinking, ceiling lights alive, kids moving a bit) |
| `src/arcadeclaw/parts/toys.js` | TOYS | every plush/toy from the picture as pixel art + ~10 invented ones in the same style, collision shapes, names EN/ES/DE |
| `src/arcadeclaw/src.html`, `parts/game.js`, `tests/arcadeclaw/run.mjs`, home icon / README / cards / CLAUDE.md entry | GAME | page shell, state machine, input, physics, claw motion, fisheye post-process, i18n UI, prize dialog, tests, publishing bits |
`python3 src/arcadeclaw/build.py` -> `docs/arcadeclaw/index.html` (pastes the top bar verbatim, favicon, keeps the l102-card block,
inlines parts in the order art.js, toys.js, game.js inside one `<script>`; each part must be plain JS, no imports, `"use strict"` safe,
and define ONLY its one global: `ART`, `TOYS`, or game code wrapped in an IIFE).

## Drawing model
- Everything is drawn into ONE offscreen canvas of 192x342 with `imageSmoothingEnabled=false`, integer coordinates where possible.
- GAME then applies the fisheye (barrel) remap via a lookup table into a second 192x342 buffer and shows it scaled up with
  nearest-neighbour (`image-rendering: pixelated`), as large as fits (integer scale when possible), centred; the page
  background around it continues the dark arcade mood.
- Pixel art = palette strings (e.g. `"..aabb.."` rows) baked once into small offscreen canvases (fast), then `drawImage`.

## ART API (global `ART`)
```
ART.W = 192; ART.H = 342;
ART.GEOM = {            // base-pixel geometry, ART decides the numbers to match the picture
  glass:{x0,y0,x1,y1},  // inner play window
  railY,                // gantry rail y
  clawMinX, clawMaxX, clawHomeX, clawTopY,   // claw hub x range and its y when fully up
  floorY,               // y of the prize floor surface (toys rest on it); may be a function floorAt(x)
  wallL, wallR,         // x of the inner side walls (toys collide with these)
  chute:{x0,x1,y0,y1},  // the transparent prize box at bottom-left; y0 = its top opening; toys can't enter except from above
  dropX,                // claw x where it opens over the chute
  joystick:{cx,cy,r}, grab:{x0,y0,x1,y1}, coin:{x0,y0,x1,y1}, credits:{x0,y0,x1,y1}
};
ART.drawScene(ctx, s, layers)   // draws the whole frame in order:
  //  arcade background (animated by s.t) -> cabinet inside -> layers.toys(ctx) -> chute box front glass
  //  -> gantry + cable + claw (calls layers.held(ctx, gx, gy, angle) between back and front prongs; gx,gy = grip point)
  //     (optional layers.claw(ctx, img, hx, hy, angle, ox): draws each claw sprite itself, rotated by angle around hub hx,hy, sprite x offset ox)
  //  -> glass reflections -> cabinet frame + marquee (lights animate) -> control panel
// s = { t, clawX, clawY /*hub top y*/, clawAngle /*swing, radians*/, clawOpen /*0 closed..1 open*/,
//       joyX /*-1..1 tilt*/, grabDown /*bool*/, credits /*0..9*/, creditsFlash /*0..1*/, coinT /*-1 or 0..1 coin going in*/,
//       busy /*claw running: GRAB lit differently*/ }
ART.clawGrip(s) -> {x,y,spread}   // where the prongs' tips are (for physics), spread = half gap between tips
```
## TOYS API (global `TOYS`)
```
TOYS.list = [{ id, name:{en,es,de}, w, h,              // sprite size in base px (most 18-34 px)
               parts:[{x,y,r}],                         // collision circles relative to sprite centre (1-4 circles)
               mass, grip /*0..1 how well the claw holds it*/ }]
TOYS.draw(ctx, id, x, y, angle, opts)   // centred at (x,y); opts {highlight:bool (bright shade for "the one under the claw"), alpha}
TOYS.big(id, scale) -> canvas           // bigger crisp copy for the "you got it" dialog
```
## GAME rules (from the user)
- Tap the coin slot: the coin goes in (animation), CREDITS lights up, +1 (max 9).
- Joystick: drag it (touch/mouse; keyboard arrows) -> claw moves left/right along the rail, and WIGGLES (pendulum on its
  cable) when it starts/stops; it keeps wiggling while it goes down.
- A shade/highlight on the toy the claw is over.
- GRAB (button or space): uses 1 credit; claw goes down, closes, picks with physics, goes up, travels to the chute, opens,
  the toy drops through the trapdoor -> dialog "Congrats, you got <name>!" (translated, big pixel icon).
- 1 out of 3 grabs the claw opens on the way and drops it; otherwise success depends on where/how it grabbed (centre + grip).
- Physically believable: toys are rigid bodies (compound circles) that pile, roll and settle; claw prongs collide.
- Many toys (fill the floor like the picture). No refill while playing (see v3).

## v2: DEPTH, pointer, more toys, respawn (user, later)
- The play area has DEPTH. Every toy and the claw have `z` in [0, ART.GEOM.depth] (0 = front glass, depth = back wall,
  ~40 base px). Toys are rigid bodies of spheres in 3D (x, y=height above floor, z). Screen mapping (2.5D, no scaling of
  pixel art): `sx = x`, `sy = floorY - y - z * ART.GEOM.depthRise` (back rows sit higher on screen), back rows drawn a bit
  darker (`TOYS.draw(..., {shade: 0..1})`). Draw order back to front (sorted by z, then y).
- The claw moves left/right AND back/front: joystick x -> claw x, joystick y (or Up/Down keys; dragging the stick up = back)
  -> claw z. `s.clawZ` is passed to ART: the trolley rides front/back on the gantry, the claw is drawn `z*depthRise` higher.
  The wiggle is a pendulum in both x and z.
- Pointer: a blinking red line from the claw tips straight down to the top of whatever is below (toy or floor), plus a soft
  dark shadow ellipse on that surface; the toy under it gets the highlight. GAME draws these in `layers.toys` at the right
  depth (so toys in front of the target cover the line).
- Toys look a bit volumetric (rounded shading, rim light) so the pointer reads well.
- 50-60 toy kinds. `TOYS.list[i].cute` (0..1): the cutest/nicest start at the front, sitting upright; the rest fill the back.
  The machine holds ~20 toys at a time (user correction), drawn from the 50-60 kinds.
- ~~Each toy won -> a new one spawns rising from the floor~~ (replaced in v3).

## v3: heavy toys, a composed start, the machine empties (user, later)
- Toys feel heavy: stronger gravity, no bounce, grippy, rolling resistance when resting, slightly tilted toys sit back
  up, quick sleep; a toy only wakes for a real push or a moving neighbour; a grab wakes only the toys around the claw.
- Start: four standing rows on the floor from the front glass to the back wall (the cutest, not-too-big toys in the
  two front rows, tallest in the middle of each row), then ONE layer on top, only towards the back. ~34 toys, each kind
  at most once. Plush squashes against the front glass / back wall (depth radius x0.35) so the front row stands at the
  glass.
- No credit: touching the joystick (or an arrow key) puts a coin in by itself.
- Winning does NOT add a toy: the machine can be emptied. When it is empty, closing the prize dialog refills it
  (translated message).
- Turned toys are drawn RotSprite-style (Scale2x x3, rotate, sample) in 32 angle steps; nearly upright ones upright.

## v4: saved game + Reset (user, later)
- The game is saved in localStorage `arcadeclaw.save` ({v:1, credits, won:[[id,n]], toys:[[id,x,y,z,a]]}): when
  everything rests with the claw idle, right after a win, and when leaving (mid-grab: the last resting state).
  Loading validates ids, numbers and ranges; an unusable save starts a fresh machine. Full/blocked storage: a message.
- No refill any more: an empty machine stays empty and says to reset it.
- "Your prizes" has a Reset button (asks first: Cancel / Yes, reset). Reset = new full machine, no prizes, no credits,
  saved. Disabled while the claw is busy.


## v5: depth fixes, no floating toys, new toys (user, later)
- The prize box is drawn at its own depth (`ART.drawBox(ctx, front)`, `layers.box`): toys behind it are drawn before its back
  face, so when the claw is deep in the machine the toys in front of the claw no longer cover the box.
- Toys right between the open prongs (up to `MIDZ` in front of the claw, and the one it is going down on) are drawn between
  the back prongs and the front prong, not over the whole claw.
- Nothing to sit on right behind the box: toys there slide back (they used to rest on an invisible shelf, floating out of
  reach). Loading an older save wakes such toys so they fall.
- The 4 rings are retired (`TOYS.list[i].retired`): never in a new machine, still loadable from saves and shown as prizes.
  13 new plush animals (new shapes). `TOYS.list[i].shape` = the drawing template family; a new machine uses each shape
  once before any repeats (at most 2, rarely 3).
