// What a place provides. Each module in src/scenes/ exports a PlaceModule;
// its build() returns a Place, which the game loop reads every frame.
// Nothing here runs: it's the contract, written down.

/**
 * @typedef {object} PlaceModule
 * @property {string} id      Used in links: #id@x,z,yaw,pitch
 * @property {string} title
 * @property {string} tag     The physics it's about, shown on its card
 * @property {string} blurb   One or two sentences for its card
 * @property {(ctx: { player: import("./player.js").Player, toast: (msg: string, seconds?: number) => void }) => Place} build
 *   Builds the place. It may set world.c, the place's speed of light.
 */

/**
 * @typedef {object} Goal
 * @property {string} text
 * @property {boolean} done
 * @property {string} [group]    A heading shared by consecutive goals
 * @property {number[]} [at]     [x, z, yaw, pitch]: clicking the goal takes you there
 * @property {number} [day]      A time of day (day-cycle phase) to wind the sky back to
 */

/**
 * @typedef {object} Place
 *
 * Required
 * @property {import("three").Group} group  Everything in the place. Static meshes are merged at load
 *   unless they (or a parent) have userData.dynamic.
 * @property {number[]} spawn               [x, z, yaw] where you start, and where T takes you
 * @property {Env} env                      Sky and light
 * @property {Goal[]} goals
 * @property {(frame: { player: any, eye: import("three").Vector3, camera: import("three").Camera, t: number, dT: number, dTau: number }) => void} update
 *   Called every simulation step: t is world time, dT world time elapsed, dTau your own time elapsed.
 *
 * Where you can go
 * @property {number[][]} [walk]            Walkable rectangles [x0, z0, x1, z1]
 * @property {{ x: number, z: number, r: number }[]} [colliders]  Round obstacles
 * @property {number} [bounds]              Without walk: how far from the origin you may go (default 100)
 *
 * Words on screen
 * @property {string} [note]                Shown under the crosshair whenever it changes (often a getter)
 * @property {string[]} [tips]              "What's going on here", in the help
 * @property {() => string[][]} [readouts]  [label, value] rows for the Lab
 * @property {import("./events.js").EventLog} [log]  Events for the "observed" panel
 * @property {() => { text: string, sun: boolean }} [clock]  A time-of-day chip
 *
 * Doing things
 * @property {(eye: import("three").Vector3) => ({ label: string, run: () => void } | null)} [action]  What E does here
 * @property {(code: string) => boolean} [onKey]  Extra keys; return true when handled
 * @property {(ball: object) => void} [onThrow]  Told about each ball you throw
 * @property {() => void} [fire]            Replaces throwing a ball with something else
 *
 * Drawing
 * @property {{ bloom?: { strength: number, radius: number, threshold: number } }} [post]
 * @property {{ strength: number, threshold: number }} [bloomNow]  Bloom that changes over time
 * @property {boolean} [shadows]            Sun shadows
 * @property {number} [mirrorY]             Height of a reflecting water surface
 * @property {number} [far]                 Camera far plane (default 12000)
 * @property {import("three").Object3D} [cockpit]  Carried with you, facing your heading
 *
 * Sound
 * @property {"sea" | "rain" | "snow"} [ambience]
 * @property {(eye: import("three").Vector3) => ({ pos: import("three").Vector3, D: number, riding: boolean } | null)} [sound]
 *   The vehicle to hum, where you see it, and its Doppler factor
 *
 * Minimap
 * @property {{ paths?: object[], rings?: object[] }} [map]
 * @property {() => number} [mapRange]
 * @property {boolean} [noMap]
 *
 * Special movement
 * @property {boolean} [rocket]             Throttle builds speed without limit (the Endless Road)
 * @property {object} [ship]                You're aboard a starship: see Player.shipUpdate
 * @property {boolean} [fixedC]             Light speed can't be changed here
 * @property {(player: any) => (number | { x: number, z: number } | 0)} [rebase]
 *   Places that go on forever move the world back under you; return the shift
 * @property {import("./day.js").DayCycle} [day]  Lets goals wind the sky to their time of day
 */

/**
 * @typedef {object} Env
 * @property {number[]} sun        Direction of the sun (or the light)
 * @property {number[]} sunColor
 * @property {number[]} sky        Light from the sky
 * @property {number[]} ground     Light bounced up from the ground
 * @property {string} fog
 * @property {number[]} fogRange   [near, far]
 * @property {string} skyTop
 * @property {string} skyHorizon
 * @property {number} [night]      0 to 1
 * @property {number} [space]      1 for deep space: stars all round, no horizon
 * @property {number} [stars]
 * @property {number} [sunDisk]    0 hides the sky's own sun
 * @property {number} [clouds]
 * @property {number} [aurora]
 * @property {number} [vary]       0 turns off the faint surface variation (for worlds that move under you)
 */

export {};
