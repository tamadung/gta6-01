# SOLMARA — gta6-01 build log

Entry: an original top-down open-world crime game in a sun-soaked coastal
city. No real city, no real people, no borrowed names, art or music.

## What it is

- `game/index.html` — the canvas page (1280x720 logical, scales to window).
- `game/src/config.js` — tuning, palette, city grid, car models, missions, places.
- `game/src/random.js` — seeded RNG (mulberry32) + pickers.
- `game/src/city.js` — the city: avenues/streets, blocks, buildings, parks,
  plaza, beach, docks, plus road/building queries.
- `game/src/world.js` — the sim: player on foot/in car, traffic AI (road
  following, braking), police AI (road chase + ramming, foot cops, busting),
  pedestrians (walk/flee/down), bullets, pickups, wanted level (0–5, decay,
  respray), collisions, camera, effects.
- `game/src/missions.js` — five story missions in order (Pickup, Getaway
  Driver, Collect the Debts, Lose the Heat, The Big One), taxi fares, hidden
  packages (10).
- `game/src/render.js` — drawing: ground/roads/buildings (fake-height roofs),
  cars, peds, HUD (cash/health/armor/ammo/stars/objective/speed/prompt/toast),
  minimap with blips, title/pause/busted/wasted/legend screens.
- `game/src/audio.js` — procedural WebAudio: engine hum, siren, gunshots,
  crash, pickups, honk, mission jingle, a bassline loop. Mute with M.
- `game/src/input.js` — keyboard + mouse (+ basic touch).
- `game/src/shots.js` — the four screenshot scenes (autopilot follows roads).
- `game/src/main.js` — boot, fixed-step loop, screens, localStorage save/load.
- `main.ts` — copies game/ + screenshots/ to /output, writes dossier.json
  (header rewritten in my own words + one stderr line; behavior unchanged).

## How to play

WASD/arrows move & drive, E enter/steal/interact, hold E at the bank to rob
it, F punch, mouse click shoot, Space handbrake, Shift run, M mute, P pause,
Enter start/continue. Progress saves automatically (cash, mission, packages,
position). `node serve.ts`, then http://localhost:8080.

## Validation (18 Nov 2026)

- Served game/ on :8080 and opened it in headless Chrome (Puppeteer 25,
  Chrome 156, swiftshader). No page errors (after adding a data: favicon).
- Played it live: Enter to start, drove/walked with W, picked up a hidden
  package ($150 → $250). Title screen, HUD, minimap and toasts all render.
- 4 screenshots, all real renders of the game's own code via ?shot= scenes
  (autopilot drives/walks the real sim): 1-chase (cover, 3 stars, Veloce at
  230 km/h), 2-street (on foot, market, 1 star), 3-heist (4 stars, escape),
  4-beach (beach road, water, palms). All 1280x720 JPEG, 78–93 KiB.
- `makefun check` (kit): ok True, 0 failed (competition_open, snapshot,
  license_osi, entrypoint pass; transcript + repo checks are site-side).
- `MAKEFUN_OUTPUT_DIR=out node main.ts` twice: byte-identical (16 files,
  1008K). dossier.json 556,994 bytes; source text 105,274 bytes (under the
  163,840 cap) with every game source file included whole.
- Screenshot fixes made along the way: the heist escape route now follows
  roads only (it cut across a block and wedged the car), the beach drive now
  uses the 2200 street, the HUD health/armor labels no longer overlap the
  bars, and a data: favicon stops the 404.

## Five weakest points

1. Top-down 2D, not 3D: the city reads instantly in a screenshot, but it
   cannot match a 3D game's sense of place. The art direction (warm palette,
   roof shadows, beach/docks) carries the look instead.
2. Police chase is a greedy road-follower, not a pathfinder: a cop can take a
   long way around a block, and two cops can wedge each other at an
   intersection. It converges, but not elegantly.
3. Traffic has no traffic lights and no real yielding at intersections: cars
   brake for the car ahead, but two cars can enter a crossing together and
   overlap briefly. It reads as busy traffic, not as a traffic simulation.
4. The wanted decay is generous (18 s hidden, then a star every 9 s): losing
   the heat is easy once you break line of sight, which makes mission 4
   (Lose the Heat) short.
5. The dossier is 105 KB of source: the judge's outline shows only first
   declarations, so the depth (missions, AI, economy) is mostly told by the
   screenshots and the file/function names, not by the code it can read.
