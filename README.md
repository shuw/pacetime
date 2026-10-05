# Pacetime

A browser game where light moves at a walking pace. At the speed of a jog or a bicycle, the strange parts of special relativity stop being equations and become things you can stand and watch, ride through, and throw things at.

**Play:** https://shuw.github.io/pacetime/ (Chrome, Edge, Firefox or Safari on a computer; touch screens work too)

## Places

1. **Seaside Funfair** (light at 21.6 km/h). A pier from golden hour into night and round to morning:
   - A Ferris wheel whose rim moves at 80% of light speed: bent spokes, one side bluer than the other, and riders who come off younger.
   - A roller coaster, swings, fireworks you hear long before you see, and a lighthouse beam that lies on the mist as a spiral.
   - A shooting gallery where you have to aim where targets are, not where you see them.
   - A hall of mirrors where each reflection waves back later than the last, scooters to ride down the pier, a torch and a sparkler.
2. **Endless Road** (72 km/h). A generated road that never ends:
   - Throttle up through 99%, 99.99%, nine nines, as the whole world folds into the way ahead and the view behind goes dark.
   - A train on the next track tries to keep pace, and looks perfectly ordinary while it does.
   - Fire a pulse of light down the road and chase it: it always pulls away at exactly light speed.
3. **Starship** (light at its real speed). Take the Pacer from orbit above Earth to Proxima Centauri, 4.24 light-years away, and back:
   - A few minutes pass for you; more than eight years pass at home.
   - Cards from the crew arrive as their light catches up: none on the way out, eight years of them on the way back.
   - Walk about the cabin at full speed with Pip the robot. Aboard, nothing is strange; only the view gives it away.
4. **Neon Crossroads** (36 km/h). A rainy city night:
   - Taxis at 85% of light speed seem to outrun light as they come at you, then crawl away and fade into the infrared.
   - Traffic lights change together but ripple out from wherever you stand. Thunder arrives before the lightning.
   - A billboard you can only read by running at it, or away from it.
5. **Einstein's Railway** (18 km/h). A country station in a summer valley, with red trains at 87% of light speed:
   - Lightning strikes both ends of a train at once, unless you're on it (simultaneity).
   - A 62 m train fits a 40 m glasshouse tunnel with both doors shut, unless you're on it (length contraction).
   - A clock made of light ticks slow on every train, unless you're on it (time dilation).
   - A passing train looks turned rather than squashed (Terrell rotation).

The Lab (`L`) changes the speed of light and switches each effect off on its own: bending, color shift, brightening, light delay, and slow clocks with short trains. Its x-ray switch shows see-through copies of moving things where they really are. The default "Gentle" look softens the bending and color; "True to life" shows them at full strength.

The address bar keeps your place, position and Lab settings, so a refresh or a shared link puts you back where you were.

Contains flashing lights (lightning and fireworks).

## Controls

| | |
|---|---|
| `W` `A` `S` `D` | Move; you sprint by default, up to 95% of light speed |
| `Shift` | One pace faster: from a sprint, the afterburner at 99.5% |
| Drag / hold the mouse | Look around / move |
| Scroll, or the Walk / Sprint / Boost buttons | Change pace |
| `E` | Ride, board, take the helm |
| `F` or click | Throw a glowing ball (on the Endless Road, fire a pulse of light) |
| `B` | Hold to look back |
| `R` / `V` | Torch / sparkler |
| `Esc` | Back to the title screen, and back again |
| `?` | All controls |

On touch screens, the left thumb moves (push far for the afterburner) and the right thumb looks.

## How it works

One family of shaders (`src/shaders.js`) draws everything as you would actually see it:

- **Where**: each vertex is drawn where it was when the light now reaching you left it, then Lorentz-boosted into your moving frame. Moving things are solved for their own retarded positions and contracted along their motion. Spinning things solve the same light-cone equation per vertex.
- **What color**: surfaces send out red, green and blue light plus infrared and ultraviolet tails. Every wavelength is divided by the Doppler factor (yours and the source's) and read back through the eye's three color responses. That's what turns stars into a starbow and makes taillights vanish.
- **How bright**: intensity follows the Doppler factor, with the eye adapting so the view doesn't black out.
- **Very close to light speed**: γ and 1 − β are computed exactly in JavaScript and handed to the shaders, so the view stays correct at 99.9999999999% of light speed. Endless places move the world back under you in whole tiles, and light-years-away planets are drawn on scaled-down copies in exactly the same direction and size.
- **Sound** travels at its ordinary speed, 343 m/s, so in the slow-light places it always beats the light.

Riding composes your walking velocity with the vehicle's relativistically. Your watch runs in your own proper time while the world's clocks advance γ times faster.

## Developing

Needs [Bun](https://bun.sh) and, for the browser tests, Google Chrome.

```sh
bun install
bun run dev        # http://localhost:5180, rebuilds on change (refresh to see it)
bun run test       # every place's goals played through in Chrome, about 35 seconds
bun run build      # a static site in dist/
```

- `bun run shot '#city@1,14,0,0'` saves a screenshot of any spot to `shots/`. Add `--advance 30` to fast-forward, `--js '…'` to run code first, `--hud` to keep the interface.
- `node scripts/perf.mjs` prints frame rate and draw calls per place.
- `window.pacetime` in the browser console exposes the player, world, effects, `advance(seconds)` and `warp`.

Pushing to `main` deploys to GitHub Pages.

## Prior art

[A Slower Speed of Light](https://gamelab.mit.edu/games/a-slower-speed-of-light/) and OpenRelativity (MIT Game Lab), [Velocity Raptor](https://testtubegames.com/velocityraptor_old.html), [Real Time Relativity](https://arxiv.org/abs/physics/0701200), Ute Kraus's [Space Time Travel](https://www.spacetimetravel.org/), and [Relativity for Games](https://arxiv.org/abs/1703.07063).

## License

[MIT](LICENSE)
