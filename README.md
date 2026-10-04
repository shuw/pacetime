# Pacetime

A browser game where light moves at a walking pace. At 3 to 10 m/s, the strange parts of special relativity stop being equations and become things you can stand and watch, ride through, and throw things at.

## Play

```sh
bun install
bun run dev        # http://localhost:5180
```

WASD to move, Shift to sprint, mouse to look, E to ride, F or click to throw a glowing ball, hold B to look back, T to return to the start, L for the Lab, M to choose a place, ? for all controls. Click a goal in the list to jump to a good spot for it. On touch screens, the left thumb moves (push far to sprint) and the right thumb looks.

The address bar keeps your place, position and Lab settings, so a refresh or a shared link puts you back where you were.

## Places

1. **Seaside Funfair** (light at 6 m/s). A pier at dusk:
   - A Ferris wheel whose rim moves at 80% of light speed. Its spokes look bent, one side bluer than the other, and riding it leaves you younger.
   - A roller coaster that tops out at 90%, where the whole bay folds into a bright dome ahead of you.
   - A lighthouse whose beam lies on the mist as a spiral.
   - Fireworks you hear long before you see, mirrored in the sea.
2. **Neon Crossroads** (10 m/s). A rainy city night:
   - Taxis at 85% of light speed seem to cover ground six times faster than light as they come at you, then crawl away and fade into the infrared.
   - Traffic lights change together but ripple outward from wherever you stand, and power flickers roll down the avenue.
   - Hail a taxi and the city folds into a tunnel.
3. **Winter Village** (7 m/s). A snowy valley:
   - A church clock that always reads behind.
   - A bell you hear at once but see swing seconds later.
   - Steam trains whose puffing comes from where the engine really is, not where you see it.
   - A carousel that leaves you younger.
   - Snowfall that streams at you like stars when you sprint.
4. **Einstein's Railway** (5 m/s). A rail line adrift in deep space with glass trains at 87% of light speed:
   - Lightning strikes both ends of a train at once, unless you're on it (simultaneity).
   - A 62 m train fits a 40 m tunnel with both doors shut, unless you're on it (length contraction).
   - A light clock on each train ticks slow, unless you're on it (time dilation).
5. **Chasing the Beam** (3 m/s). Pulses of light you can watch crawl through dust. Sprint after one and it still pulls away at exactly c.

The Lab changes the speed of light and switches each effect off on its own: bending, color shift, brightening, light delay, and slow clocks with short trains.

## How it works

One family of shaders (`src/shaders.js`) draws everything as you would actually see it:

- **Where**: each vertex is drawn where it was when the light now reaching you left it, then Lorentz-boosted into your moving frame. Trains, taxis and coaster cars are solved for their own retarded positions and contracted along their motion. Spinning things (wheels, carousels, skaters, the steam trains' loop) solve the same light-cone equation with Newton's method, per vertex. Fireworks, rain, snow and thrown balls are particles that do the same.
- **What color**: surfaces send out red, green and blue light plus infrared and ultraviolet tails. Every wavelength is divided by the Doppler factor (yours and the source's) and read back through the eye's three color responses. That's what turns stars into a starbow, makes taillights vanish, and turns snow into a rainbow tunnel.
- **How bright**: intensity follows the Doppler factor, with eye adaptation so the view doesn't black out.
- **Light in flight**: flashes are drawn on the ground as the ellipse their light can have reached by now. The lighthouse beam and the dust beams are lit at the moment each pulse passes. Reflections are mirrored copies, which get light delay right for free.
- **Sound** travels at its ordinary speed, 343 m/s, so in these places it always beats the light.

Riding composes your walking velocity with the vehicle's relativistically. Your watch runs in your own proper time while the world's clocks advance γ times faster.

## Developing

With the dev server running and Google Chrome installed:

- `bun run test` runs everything in about 25 seconds: UI checks, both experiment scenes, and every goal in the everyday scenes, with the world fast-forwarded.
- `bun run shot '#city@1,14,0,0'` saves a screenshot of any spot to `shots/`. Add `--advance 30` to fast-forward, `--js '…'` to run code first, `--hud` to keep the interface.
- `node scripts/perf.mjs` prints frame rate and draw calls per place.
- `window.pacetime` in the browser console exposes the player, world, effects, `advance(seconds)` and `warp`.

## Prior art

[A Slower Speed of Light](https://gamelab.mit.edu/games/a-slower-speed-of-light/) and OpenRelativity (MIT Game Lab), [Velocity Raptor](https://testtubegames.com/velocityraptor_old.html), [Real Time Relativity](https://arxiv.org/abs/physics/0701200), Ute Kraus's [Space Time Travel](https://www.spacetimetravel.org/), and [Relativity for Games](https://arxiv.org/abs/1703.07063).
