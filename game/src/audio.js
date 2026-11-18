// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// Engine hum follows the car's speed, the siren wails while the heat is on,
// and gunshots, crashes, pickups and UI clicks are short noise/tone bursts.
// A tiny bassline loop plays under the game. Mute with M.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle that alternates two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function startMusic() {
    // A slow bassline: A minor, one note a beat, 100 bpm.
    const notes = [55, 55, 65.4, 49, 55, 55, 82.4, 73.4];
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) return;
      const freq = notes[musicStep % notes.length];
      musicStep += 1;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }, 600);
  }

  function burst(duration, type, freq, vol) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function noise(duration, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** Called every frame with the driving state: engine pitch + siren. */
    update(driving, speed, wanted) {
      if (!ctx) return;
      if (engineGain) {
        engineGain.gain.value = driving ? 0.05 + Math.abs(speed) / 640 * 0.06 : 0;
        engineOsc.frequency.value = 50 + Math.abs(speed) * 0.12;
      }
      if (sirenGain) {
        sirenGain.gain.value = wanted > 0 ? 0.035 : 0;
        sirenOsc.frequency.value = Math.floor(performance.now() / 450) % 2 === 0 ? 700 : 950;
      }
    },
    shot() { noise(0.09, 0.5, 2400); burst(0.06, 'square', 180, 0.2); },
    copShot() { noise(0.09, 0.3, 1800); },
    crash() { noise(0.25, 0.6, 500); burst(0.18, 'sine', 70, 0.5); },
    pickup() { burst(0.12, 'sine', 880, 0.25); burst(0.16, 'sine', 1320, 0.2); },
    steal() { burst(0.15, 'square', 220, 0.25); },
    honk() { burst(0.22, 'square', 370, 0.3); burst(0.22, 'square', 466, 0.25); },
    mission() { burst(0.2, 'sine', 660, 0.3); burst(0.25, 'sine', 990, 0.3); },
    rob() { noise(0.4, 0.4, 900); burst(0.3, 'sawtooth', 110, 0.3); },
    click() { burst(0.05, 'sine', 1200, 0.15); },
    busted() { burst(0.5, 'sawtooth', 220, 0.3); burst(0.5, 'sawtooth', 165, 0.3); },
  };
}
