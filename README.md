[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/hibikazen/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/hibikazen/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Sunset Bay

An original open-world crime game, built for [make.fun's Make GTA 6 bounty](https://make.fun/bounty/gta6-01). Mara Quinn came home to Sunset Bay with a busted bike, a dead-end garage job, and a debt she never agreed to. Steal cars, lose the cops, and run three story missions across five districts — all in a desktop browser, offline, from static files.

## What it is

- **A complete open world** — a sun-soaked coastal city at golden hour with five distinct districts: Downtown Meridian's towers, the Palm Marina boardwalk and ferris wheel, Coral Heights, the Port Delmar docks and crane, and brick Old Town. A 9×9 street grid with traffic, sidewalks, palms, streetlights and neon signs.
- **On foot and by car** — walk, run and jump through the city, or get in any car (E). Parked cars are free; stealing one from its driver brings the law down on you.
- **Traffic and pedestrians** — cars cruise the grid and slow for the car ahead; pedestrians stroll the sidewalks, turn at corners, and flee from gunfire and speeding cars.
- **A wanted system and police** — 1–5 stars for carjacking, hitting pedestrians, ramming cruisers and shooting in public. Police cars chase and ram; hide long enough and the heat cools. Get caught standing still and it's BUSTED; lose all your health and it's WASTED.
- **Missions and a story** — three chained jobs: *Repo Run* (steal the gold coupe, deliver it to the garage), *Heat Wave* (lose a 3-star wanted level), and *Harbor Hustle* (grab a package from the guarded dock office, deliver it to the Marina). Mission markers, objectives and rewards on the HUD.
- **Combat** — punch (F) up close, or the pistol (click to shoot) with muzzle flash, tracers and hit feedback. Armed guards shoot back on the harbor job.
- **HUD with minimap** — wanted stars, money, health, clock, district name, speedometer, mission objective, and a live circular minimap with player arrow, traffic, flashing police blips and mission markers.
- **Start screen and save** — title screen with the story and controls, pause menu (Esc), and a localStorage save (money, missions, position) with Continue.
- **Synthesized sound** — engine hum, sirens, gunshots, punches and a lazy sunset bassline, all generated with WebAudio. No audio files. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse drag | Orbit camera |
| Mouse wheel | Zoom |
| E | Enter / exit car |
| F | Punch |
| Click | Shoot pistol |
| Shift | Run |
| Space | Jump / handbrake |
| Esc | Pause & save |
| M | Mute |

## Try it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game is plain static files under `game/` — no build step, no network request. three.js is vendored under `game/vendor/`.

## Originality

Everything here is original: the city, districts, characters, vehicles, names, story, art and sound. Nothing from Rockstar Games' Grand Theft Auto series or any other commercial game — no names, logos, characters, map, art or music from them.

## License

MIT — see [LICENSE](LICENSE).
