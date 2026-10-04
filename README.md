# Pacetime

A browser game set on a rail station adrift in deep space, where light moves at a walking pace. At 3 to 5 m/s, the strange parts of special relativity stop being equations and become things you can stand and watch. Lightning that strikes "at the same time" doesn't, depending on where you ride. A train fits in a tunnel shorter than itself. A clock on a passing train ticks slow. And however fast you run after a pulse of light, it pulls away at exactly c.

## Play

```sh
bun install
bun run dev        # http://localhost:5180
```

WASD to move, Shift to sprint, mouse to look, E to board or step off a train, hold B to look back, T to return to the start, L for the Lab, M for the experiments. On touch screens, the left thumb moves (push far to sprint) and the right thumb looks.

## Experiments

1. **Einstein's Train** (simultaneity). Lightning hits both ends of a passing train at once by the platform's clocks. Watch from the platform, then ride the train through the strikes.
2. **Train and Tunnel** (length contraction). A 62 m train fits a 40 m tunnel with both doors shut. To the passengers, the tunnel is only 20 m long and the doors don't shut together.
3. **The Light Clock** (time dilation). A photon bounces between two mirrors on the platform and on a train. Trails show the moving one zigzagging, and from the train it's the platform clock that runs slow.
4. **Chasing the Beam** (constancy of c). Pulses you can watch crawl through the dust. Outgoing ones seem to move at half speed, incoming ones arrive with no warning, and sprinting after one changes nothing.

An observation log records when each event's light reached you and, with the travel time taken out, when it happened in your frame. The Lab changes the speed of light and switches each effect off on its own.

## How it works

One shader (`src/shaders.js`) draws everything as you would actually see it:

- **Where**: each vertex is drawn where it was when the light now reaching you left it, then boosted into your moving frame. Moving trains are solved for their own retarded positions and drawn Lorentz-contracted.
- **What color**: surfaces send out red, green and blue light plus infrared and ultraviolet tails. Every wavelength is divided by the Doppler factor and read back through the eye's three color responses. That's what turns the star field into a rainbow "starbow" ring at high speed.
- **How bright**: intensity follows the Doppler factor, with eye adaptation so the view doesn't black out.
- **Light in flight**: flashes and beams are drawn by the glow they scatter off the deck and the dust. Each flash appears as an expanding ellipse with the flash and your eye at its foci, which is exactly where its light can have reached you by now.

Riding a train composes your walking velocity with the train's relativistically. Your watch runs in your own proper time while the platform clock advances γ times faster.

## Prior art

[A Slower Speed of Light](https://gamelab.mit.edu/games/a-slower-speed-of-light/) and OpenRelativity (MIT Game Lab), [Velocity Raptor](https://testtubegames.com/velocityraptor_old.html), [Real Time Relativity](https://arxiv.org/abs/physics/0701200), Ute Kraus's [Space Time Travel](https://www.spacetimetravel.org/), and [Relativity for Games](https://arxiv.org/abs/1703.07063).

## Scripts

With the dev server running and Google Chrome installed:

- `node scripts/playtest.mjs` screenshots each experiment.
- `node scripts/experiments.mjs <scene>` plays one experiment with scripted moves (watch, board, ride) and prints what the log recorded.
