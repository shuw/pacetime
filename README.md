# Pacetime

A whimsical 3D browser playground where light travels at walking pace (3 m/s), so special relativity is something you feel rather than read about. Jog and the meadow bends toward you, colors slide along the rainbow, the world ahead brightens, and your watch falls behind every other clock.

## Play

```sh
bun install
bun run dev        # http://localhost:5180
```

WASD to walk, Shift to sprint, mouse to look, hold B (or right-click) to glance back, L for the Lab, M for the scene map. On touch screens: left thumb moves (push far to sprint), right thumb looks.

## Scenes

- **Lollipop Meadow**: a checkerboard playground with an avenue of rainbow arches and a clock tower. Sprint through the arches, glance back, and get younger than the meadow.
- **Firefly Choir**: forty fireflies flash at the same instant, but you see the flashes ripple outward from wherever you stand. Find the one spot where they look in sync.
- **The Shy Garden**: critters painted only in infrared or ultraviolet. Sprint at the imps to blueshift them into view; run away from the moths and glance back.
- **Tea for Two**: the twin paradox as a picnic. The kettle needs 90 s of world time and your sand timer holds 40 s of yours, so run laps fast enough to come back younger than your twin, Pip.

The Lab lets you change the speed of light and switch each effect off on its own (bending, color shift, brightening, light delay, slow watch).

## How it works

Everything in the world is at rest except you. Every surface is drawn by one shader (`src/shaders.js`):

- **Where things appear**: each vertex is placed where the light it emitted earlier lands in your moving frame. That's a Lorentz boost of the emission event on your past light cone, so aberration and the apparent stretching come out exactly.
- **What color they are**: every surface has red, green and blue bands plus broad infrared and ultraviolet light. All wavelengths are divided by the Doppler factor and read back through three eye-response curves. Leaves are bright in infrared, as real foliage is, so trees glow when you run at them.
- **How bright**: intensity scales with the Doppler factor, and an eye-adaptation exposure keeps the view from blowing out or going black.
- **When**: animated things (clocks, fireflies, the kettle) show the world time at which their light left them. Your watch advances in proper time, and the world advances γ times faster.

You "push" with a fixed proper velocity, so with realistic light speed (try the Lab slider) you are back to an ordinary walk and sprint.

## Prior art

[A Slower Speed of Light](https://gamelab.mit.edu/games/a-slower-speed-of-light/) and its OpenRelativity toolkit (MIT Game Lab), [Velocity Raptor](https://testtubegames.com/velocityraptor_old.html), [Real Time Relativity](https://arxiv.org/abs/physics/0701200), Ute Kraus's [Space Time Travel](https://www.spacetimetravel.org/), and [Relativity for Games](https://arxiv.org/abs/1703.07063).

## Scripts

`scripts/playtest.mjs` screenshots each scene at rest, walking, sprinting and glancing back. `scripts/goals.mjs` plays the choir and tea goals with scripted steering. Both need the dev server running and Google Chrome installed.
