# SOLMARA — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tamadung/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tamadung/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down open-world crime game in a sun-soaked coastal city,
built for the [make.fun bounty gta6-01](https://make.fun/bounty/gta6-01)
("Make GTA 6"). Explore Solmara on foot and by car, steal cars, dodge the
police, and run five story missions for the crew.

## The city

Solmara is a street grid with avenues and cross streets, a market, a plaza,
a park, a beach along the south edge and docks on the east. Traffic follows
the roads, pedestrians walk the sidewalks and flee from trouble, and the
police respond to a wanted level of 1–5 stars.

## How to play

- **WASD / Arrows** — move on foot, drive in a car
- **E** — enter / steal a car, interact (collect debts, pick up fares, respray)
- **Hold E at the bank** — rob it (mission 5)
- **F** — punch, **mouse click** — shoot the pistol
- **Space** — handbrake, **Shift** — run, **M** — mute, **P** — pause
- **Enter** — start / continue

Missions: The Pickup, Getaway Driver, Collect the Debts, Lose the Heat, and
The Big One. Side work: taxi fares, hidden packages (10), and a respray shop
that clears your wanted level. Cash buys ammo and health; progress saves
automatically.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. The game is plain static files under
`game/` (no build step, no network). `main.ts` copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json`.

## Layout

- `game/index.html` — the canvas page
- `game/src/config.js` — tuning, palette, city constants, mission data
- `game/src/random.js` — seeded RNG
- `game/src/city.js` — the city map: roads, buildings, beach, docks
- `game/src/world.js` — the simulation: player, cars, traffic, police, peds, combat, wanted
- `game/src/missions.js` — the story missions, taxi fares, hidden packages
- `game/src/render.js` — drawing: city, cars, HUD, minimap, screens
- `game/src/audio.js` — procedural WebAudio sounds and music
- `game/src/input.js` — keyboard and mouse
- `game/src/shots.js` — the four screenshot scenes
- `game/src/main.js` — boot, loop, screens, save/load

## License

MIT.
