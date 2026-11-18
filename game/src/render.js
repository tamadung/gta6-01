// Drawing only: the world's state and the current screen in, pixels out.
// Top-down, sun-soaked: warm asphalt, terracotta roofs with a fake-height side,
// a beach and docks, cars with windshields and headlights, a HUD with a minimap.
// The camera follows the player; the canvas is the window, scaled by device pixels.
import { AVENUES, BEACH, CAR_MODELS, DOCKS, ECONOMY, PAL, PLACES, ROAD_W, SIDEWALK_W, STREETS, WANTED, WORLD } from './config.js';
import { activeMission, missionObjective, missionTarget, storyProgress, taxiTarget } from './missions.js';
import { clamp, dist } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_DONE = 'done';

const MINIMAP = { w: 210, h: 158, pad: 14 };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  // --- world ---------------------------------------------------------------
  function drawGround(state) {
    const { city } = state;
    // Grass base.
    ctx.fillStyle = PAL.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mow stripes for a little texture.
    ctx.fillStyle = PAL.grassDark;
    for (let y = 0; y < WORLD.height; y += 160) {
      ctx.fillRect(0, y, WORLD.width, 80);
    }
    // Beach sand and water along the south edge.
    ctx.fillStyle = PAL.sand;
    ctx.fillRect(0, BEACH.y, WORLD.width, BEACH.sandH);
    ctx.fillStyle = PAL.water;
    ctx.fillRect(0, BEACH.y + BEACH.sandH, WORLD.width, WORLD.height - BEACH.y - BEACH.sandH);
    ctx.fillStyle = PAL.waterDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      ctx.fillRect(x, BEACH.y + BEACH.sandH + 18, 46, 5);
      ctx.fillRect(x + 40, BEACH.y + BEACH.sandH + 52, 52, 5);
    }
    // Docks water on the east edge.
    ctx.fillStyle = PAL.water;
    ctx.fillRect(DOCKS.x, 0, WORLD.width - DOCKS.x, WORLD.height);
    ctx.fillStyle = PAL.waterDeep;
    for (let y = 0; y < WORLD.height; y += 90) {
      ctx.fillRect(DOCKS.x + 18, y, 5, 46);
      ctx.fillRect(DOCKS.x + 52, y + 40, 5, 52);
    }
    // Piers (wooden strips into the water).
    ctx.fillStyle = '#8a6a4a';
    for (let y = 260; y < 2000; y += 320) {
      ctx.fillRect(DOCKS.x - 10, y + 60, 150, 26);
    }
    // Parks.
    for (const park of city.parks) {
      ctx.fillStyle = PAL.park;
      rr(ctx, park.x - park.w / 2, park.y - park.h / 2, park.w, park.h, 18);
      ctx.fill();
    }
    // Plaza paving.
    ctx.fillStyle = PAL.plaza;
    rr(ctx, city.plaza.x - 130, city.plaza.y - 110, 260, 220, 12);
    ctx.fill();
    // Sidewalks (a band around every road).
    ctx.fillStyle = PAL.sidewalk;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2 - SIDEWALK_W, 0, ROAD_W + SIDEWALK_W * 2, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2 - SIDEWALK_W, WORLD.width, ROAD_W + SIDEWALK_W * 2);
    // Asphalt.
    ctx.fillStyle = PAL.asphalt;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD.width, ROAD_W);
    // Lane dashes down the middle of every road.
    ctx.fillStyle = PAL.lane;
    for (const ax of AVENUES) {
      for (let y = 0; y < WORLD.height; y += 64) ctx.fillRect(ax - 2, y, 4, 30);
    }
    for (const sy of STREETS) {
      for (let x = 0; x < WORLD.width; x += 64) ctx.fillRect(x, sy - 2, 30, 4);
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(240,240,230,0.75)';
    for (const ax of AVENUES) {
      for (const sy of STREETS) {
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(ax - 34 + i * 10, sy - ROAD_W / 2 - 4, 5, 8);
          ctx.fillRect(ax - 34 + i * 10, sy + ROAD_W / 2 - 4, 5, 8);
        }
      }
    }
  }

  function drawBuildings(state) {
    const { city } = state;
    for (const b of city.buildings) {
      // Soft shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      rr(ctx, b.x + 6, b.y + 8, b.w, b.h, 6);
      ctx.fill();
      // Fake-height side face.
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(b.x, b.y + b.h, b.w, b.tall * 0.55);
      ctx.fillRect(b.x + b.w, b.y + 4, b.tall * 0.4, b.h);
      // Roof.
      ctx.fillStyle = b.roof;
      rr(ctx, b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
    }
    for (const s of city.sheds) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(s.x + 6, s.y + 8, s.w, s.h);
      ctx.fillStyle = s.roof;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(s.x + 10, s.y + 10, s.w - 20, 8);
    }
    // Trees (canopy + trunk shadow).
    for (const t of city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? PAL.treeLight : PAL.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMarkers(state, missions) {
    // Mission marker: a pulsing yellow diamond on the ground.
    const target = missionTarget(missions, state);
    if (target) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.15;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PAL.gold;
      const s = 16 * pulse;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = '#7a5a10';
      ctx.lineWidth = 3;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    // Taxi fare marker.
    const taxi = taxiTarget(missions);
    if (taxi) {
      ctx.save();
      ctx.translate(taxi.x, taxi.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#58c96b';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    }
    // Hidden packages: small gold parcels.
    for (const p of missions.packageSpots) {
      if (p.found) continue;
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(p.x - 7, p.y - 5, 14, 10);
      ctx.strokeStyle = '#7a5a10';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 7, p.y - 5, 14, 10);
    }
    // Pickups: health cross / ammo box.
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      if (pk.kind === 'health') {
        ctx.fillStyle = '#e8f0e8';
        ctx.fillRect(pk.x - 11, pk.y - 11, 22, 22);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(pk.x - 3, pk.y - 8, 6, 16);
        ctx.fillRect(pk.x - 8, pk.y - 3, 16, 6);
      } else {
        ctx.fillStyle = '#3a3a42';
        ctx.fillRect(pk.x - 11, pk.y - 8, 22, 16);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(pk.x - 6, pk.y - 3, 12, 6);
      }
    }
    // Place labels for the named spots (small, on the ground).
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const key of Object.keys(PLACES)) {
      const pl = PLACES[key];
      ctx.fillStyle = 'rgba(16,16,24,0.55)';
      ctx.fillText(pl.label, pl.x, pl.y - 34);
    }
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const halfL = car.len / 2;
    const halfW = car.wid / 2;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(ctx, -halfL + 4, -halfW + 5, car.len, car.wid, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.color;
    rr(ctx, -halfL, -halfW, car.len, car.wid, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Windshield + rear window.
    ctx.fillStyle = 'rgba(190,220,240,0.85)';
    ctx.fillRect(halfL - 18, -halfW + 4, 10, car.wid - 8);
    ctx.fillRect(-halfL + 8, -halfW + 4, 8, car.wid - 8);
    // Roof.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, -6, -halfW + 4, 16, car.wid - 8, 4);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#fff2b0';
    ctx.fillRect(halfL - 2, -halfW + 3, 3, 5);
    ctx.fillRect(halfL - 2, halfW - 8, 3, 5);
    // Cop light bar (flashes with the siren phase).
    if (car.model === 'cop') {
      const on = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = on ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-4, -halfW + 2, 8, 7);
      ctx.fillStyle = on ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-4, halfW - 9, 8, 7);
    }
    // Taxi checker strip.
    if (car.model === 'taxi') {
      ctx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-10 + i * 5, -halfW + 2, 4, 5);
    }
    ctx.restore();
  }

  function drawPed(ped, time) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      // Lying flat.
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(time * 8 + ped.phase) * 1.5;
    ctx.rotate(ped.angle);
    // Body.
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Facing tick.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(8 + bob, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Fare peds wave (a gold ring).
    if (ped.state === 'fare') {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 16 + Math.sin(time * 5) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Debtors wear a red ring so the player can find them.
    if (ped.state === 'debtor') {
      ctx.strokeStyle = PAL.red;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.inCar) return; // the car is drawn instead
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bright jacket so the player reads at a glance.
    ctx.fillStyle = '#ff7a2a';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a2a00';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Facing gun.
    ctx.fillStyle = '#22222a';
    ctx.fillRect(10, -2, 12, 4);
    // Invulnerability blink.
    if (p.invuln > 0 && Math.floor(time * 12) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBulletsAndEffects(state) {
    for (const b of state.bullets) {
      ctx.strokeStyle = '#ffe9a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const e of state.effects) {
      const a = 1 - e.t / e.life;
      if (e.kind === 'muzzle' || e.kind === 'spark') {
        ctx.fillStyle = `rgba(255,220,120,${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 7 * a + 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'crash') {
        ctx.fillStyle = `rgba(120,120,120,${a * 0.7})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 12 * a + 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(224,72,62,${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 6 * a + 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- HUD -------------------------------------------------------------------
  function drawHud(state, missions) {
    const p = state.player;
    const pad = 16;
    // Top-left panel: cash, health, armor, ammo.
    ctx.fillStyle = 'rgba(16,16,24,0.72)';
    rr(ctx, pad, pad, 250, 108, 10);
    ctx.fill();
    ctx.fillStyle = PAL.hudText;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${state.cash}`, pad + 14, pad + 32);
    // Health bar.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(pad + 14, pad + 44, 120, 12);
    ctx.fillStyle = p.health > 50 ? PAL.green : p.health > 25 ? PAL.gold : PAL.red;
    ctx.fillRect(pad + 14, pad + 44, 120 * clamp(p.health / 100, 0, 1), 12);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = PAL.hudText;
    ctx.fillText('HP', pad + 142, pad + 55);
    // Armor bar.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(pad + 14, pad + 62, 120, 8);
    ctx.fillStyle = '#7ab8e8';
    ctx.fillRect(pad + 14, pad + 62, 120 * clamp(p.armor / 100, 0, 1), 8);
    ctx.fillText('ARMOR', pad + 142, pad + 70);
    // Ammo.
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(`AMMO ${p.ammo}`, pad + 14, pad + 96);
    // Wanted stars, top centre.
    const starY = pad + 8;
    const starSize = 26;
    const totalW = WANTED.max * (starSize + 6);
    const startX = (viewW - totalW) / 2;
    for (let i = 0; i < WANTED.max; i += 1) {
      drawStar(startX + i * (starSize + 6) + starSize / 2, starY + starSize / 2, starSize / 2, i < state.wanted);
    }
    // Mission objective, under the stars.
    const m = activeMission(missions);
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(16,16,24,0.72)';
    const objText = m ? `${m.title} — ${missionObjective(missions, state)}` : 'Story complete — free roam';
    const tw = ctx.measureText(objText).width;
    rr(ctx, (viewW - tw) / 2 - 14, starY + 40, tw + 28, 30, 8);
    ctx.fill();
    ctx.fillStyle = PAL.gold;
    ctx.fillText(objText, viewW / 2, starY + 61);
    // Story progress (thin bar under the objective).
    const prog = storyProgress(missions);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect((viewW - 200) / 2, starY + 78, 200, 5);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect((viewW - 200) / 2, starY + 78, 200 * prog, 5);
    // Bottom-right: speed when driving.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.36);
      ctx.fillStyle = 'rgba(16,16,24,0.72)';
      rr(ctx, viewW - 150, viewH - 76, 134, 60, 10);
      ctx.fill();
      ctx.fillStyle = PAL.hudText;
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${kmh}`, viewW - 52, viewH - 36);
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('km/h', viewW - 52, viewH - 20);
      ctx.textAlign = 'left';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(CAR_MODELS[p.inCar.model] ? CAR_MODELS[p.inCar.model].name : p.inCar.model, viewW - 140, viewH - 36);
    }
    // Context prompt, bottom centre.
    if (state.prompt) {
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const pw = ctx.measureText(state.prompt).width;
      ctx.fillStyle = 'rgba(16,16,24,0.78)';
      rr(ctx, (viewW - pw) / 2 - 12, viewH - 52, pw + 24, 32, 8);
      ctx.fill();
      ctx.fillStyle = PAL.hudText;
      ctx.fillText(state.prompt, viewW / 2, viewH - 30);
    }
    // Toast, centre.
    if (state.toastTimer > 0 && state.toast) {
      ctx.font = '700 19px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const tw2 = ctx.measureText(state.toast).width;
      ctx.fillStyle = 'rgba(16,16,24,0.8)';
      rr(ctx, (viewW - tw2) / 2 - 14, viewH * 0.62, tw2 + 28, 34, 8);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.fillText(state.toast, viewW / 2, viewH * 0.62 + 23);
    }
    // Busted warning while the timer runs.
    if (state.bustTimer > 0.2) {
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.red;
      ctx.fillText('BUSTED?', viewW / 2, viewH * 0.3);
    }
  }

  function drawStar(cx, cy, r, lit) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = lit ? PAL.gold : 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawMinimap(state, missions) {
    const x0 = viewW - MINIMAP.w - MINIMAP.pad;
    const y0 = MINIMAP.pad;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    ctx.fillStyle = 'rgba(16,16,24,0.78)';
    rr(ctx, x0 - 6, y0 - 6, MINIMAP.w + 12, MINIMAP.h + 12, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    rr(ctx, x0, y0, MINIMAP.w, MINIMAP.h, 6);
    ctx.clip();
    // Water + beach.
    ctx.fillStyle = PAL.water;
    ctx.fillRect(x0, y0 + BEACH.y * sy, MINIMAP.w, MINIMAP.h - BEACH.y * sy);
    ctx.fillRect(x0 + DOCKS.x * sx, y0, MINIMAP.w - DOCKS.x * sx, MINIMAP.h);
    ctx.fillStyle = PAL.sand;
    ctx.fillRect(x0, y0 + BEACH.y * sy, MINIMAP.w, 8);
    // Land.
    ctx.fillStyle = '#5a7a4a';
    ctx.fillRect(x0, y0, MINIMAP.w, BEACH.y * sy);
    // Roads.
    ctx.strokeStyle = '#c8c8c8';
    ctx.lineWidth = 2;
    for (const ax of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(x0 + ax * sx, y0);
      ctx.lineTo(x0 + ax * sx, y0 + MINIMAP.h);
      ctx.stroke();
    }
    for (const sy2 of STREETS) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + sy2 * sy);
      ctx.lineTo(x0 + MINIMAP.w, y0 + sy2 * sy);
      ctx.stroke();
    }
    // View rect.
    const vw = viewW / state.camera.zoom;
    const vh = viewH / state.camera.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x0 + (state.camera.x - vw / 2) * sx,
      y0 + (state.camera.y - vh / 2) * sy,
      vw * sx,
      vh * sy,
    );
    // Blips: mission (gold), taxi (green), police (blue), player (white).
    const target = missionTarget(missions, state);
    if (target) {
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(x0 + target.x * sx, y0 + target.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const taxi = taxiTarget(missions);
    if (taxi) {
      ctx.fillStyle = PAL.green;
      ctx.beginPath();
      ctx.arc(x0 + taxi.x * sx, y0 + taxi.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.cars) {
      if (car.kind === 'cop') {
        ctx.fillStyle = '#4a90ff';
        ctx.beginPath();
        ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x0 + state.player.x * sx, y0 + state.player.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PAL.hudText;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SOLMARA', x0, y0 + MINIMAP.h + 20);
  }

  // --- screens -----------------------------------------------------------------
  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(10,10,16,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    const w = 640;
    const h = 150 + lines.length * 30 + 70;
    const x = (viewW - w) / 2;
    const y = (viewH - h) / 2;
    ctx.fillStyle = 'rgba(16,16,24,0.92)';
    rr(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PAL.gold;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = accent || PAL.gold;
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, viewW / 2, y + 64);
    ctx.fillStyle = PAL.hudText;
    ctx.font = '400 17px system-ui, sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, viewW / 2, y + 108 + i * 30);
    });
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillStyle = PAL.gold;
    ctx.fillText(prompt, viewW / 2, y + h - 26);
  }

  function drawTitle(state, missions) {
    // A living backdrop: the city, slowly panning, behind the panel.
    drawWorld(state, missions);
    drawPanel('SOLMARA', [
      'A sun-soaked city. A crew that owes you. Five jobs to take it all back.',
      '',
      'WASD / Arrows — move & drive      E — enter car / interact',
      'F — punch      Mouse click — shoot      Space — handbrake      Shift — run',
      'M — mute      P — pause      Your progress saves automatically.',
    ], 'Press ENTER to play', PAL.gold);
    ctx.fillStyle = PAL.hudText;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('An original game. No real city, no real people, no borrowed names.', viewW / 2, viewH - 24);
  }

  // --- the frame ---------------------------------------------------------------
  function drawWorld(state, missions) {
    const cam = state.camera;
    const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 18 : 0;
    const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 18 : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Warm afternoon light over everything.
    ctx.fillStyle = '#f2e2b8';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(viewW / 2 + shakeX, viewH / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawGround(state);
    drawBuildings(state);
    drawMarkers(state, missions);
    for (const car of state.cars) {
      if (car.kind === 'player') continue;
      drawCar(car, state.time);
    }
    for (const ped of state.peds) drawPed(ped, state.time);
    for (const cop of state.cops) {
      // Foot cop: dark blue figure with a cap.
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = PAL.cop;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a1a3a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#c8d8f0';
      ctx.fillRect(8, -2, 10, 4);
      ctx.restore();
    }
    if (state.player.inCar) drawCar(state.player.inCar, state.time);
    drawPlayer(state, state.time);
    drawBulletsAndEffects(state);
    ctx.restore();
    // Vignette.
    const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.45, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(20,10,0,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function draw(state, missions, screen) {
    if (screen === SCREEN_TITLE) {
      drawTitle(state, missions);
      return;
    }
    drawWorld(state, missions);
    drawHud(state, missions);
    drawMinimap(state, missions);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['Your progress is saved.', ''], 'Press P to resume', PAL.gold);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmara police took you in.', 'You lose $200 and your wanted level clears.'], 'Press ENTER to continue', PAL.red);
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Solmara is not done with you yet.', 'You lose $200 and wake up at the clinic.'], 'Press ENTER to continue', PAL.red);
    } else if (screen === SCREEN_DONE) {
      drawPanel('SOLMARA LEGEND', ['All five jobs done. The city is yours.', `Cash: $${state.cash}   Packages: ${missions.packagesFound}/${ECONOMY.packages}`], 'Press ENTER to keep playing', PAL.gold);
    }
  }

  return { draw, resize, view: () => ({ w: viewW, h: viewH }) };
}
