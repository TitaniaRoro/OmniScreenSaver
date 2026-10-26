const PROFILES = {
  starfield:    { noise: .035, filter: 520, filterType: "lowpass", tones: [54, 81, 108], type: "sine", lfo: .09, cue: "whoosh", interval: 11 },
  mystify:      { noise: .018, filter: 720, filterType: "lowpass", tones: [130.81, 196, 261.63], type: "sine", lfo: .075, cue: "softChord", interval: 15 },
  pipes:        { noise: .075, filter: 560, filterType: "bandpass", tones: [61.74, 92.5], type: "sine", lfo: .12, cue: "waterDrop", interval: 7 },
  maze:         { noise: .09, filter: 360, filterType: "lowpass", tones: [73.42, 110], type: "sine", lfo: .055, cue: "wind", interval: 13 },
  bounce:       { noise: .012, filter: 800, filterType: "lowpass", tones: [174.61, 261.63], type: "sine", lfo: .12, cue: "bell", interval: 9 },
  spin:         { noise: .035, filter: 580, filterType: "lowpass", tones: [82.41, 123.47, 164.81], type: "sine", lfo: .08, cue: "softChime", interval: 12 },
  matrix:       { noise: .03, filter: 1450, filterType: "bandpass", tones: [65.41, 98], type: "sine", lfo: .07, cue: "digitalTick", interval: 8 },
  terminal:     { noise: .055, filter: 480, filterType: "lowpass", tones: [58.27, 87.31], type: "sine", lfo: .06, cue: "keyboard", interval: 6 },
  life:         { noise: .018, filter: 900, filterType: "lowpass", tones: [130.81, 174.61, 220], type: "sine", lfo: .045, cue: "softChime", interval: 6 },
  fireworks:    { noise: .085, filter: 510, filterType: "lowpass", tones: [55, 82.41], type: "sine", lfo: .06, cue: "firework", interval: 8 },
  aurora:       { noise: .07, filter: 1050, filterType: "lowpass", tones: [55, 82.41, 110], type: "sine", lfo: .035, cue: "windChime", interval: 12 },
  lava:         { noise: .065, filter: 380, filterType: "lowpass", tones: [49, 73.42], type: "sine", lfo: .045, cue: "bubble", interval: 4 },
  flow:         { noise: .065, filter: 1900, filterType: "lowpass", tones: [146.83, 220], type: "sine", lfo: .06, cue: "windChime", interval: 9 },
  constellation:{ noise: .025, filter: 1500, filterType: "lowpass", tones: [110, 164.81, 220], type: "sine", lfo: .04, cue: "twinkle", interval: 7 },
  synthwave:    { noise: .018, filter: 460, filterType: "lowpass", tones: [55, 82.41, 110], type: "triangle", lfo: .035, cue: "softChord", interval: 14 },
  clock:        { noise: .023, filter: 1300, filterType: "lowpass", tones: [110, 164.81], type: "sine", lfo: .02, cue: "clockTick", interval: 1 },
  campfire:     { noise: .12, filter: 870, filterType: "bandpass", tones: [55, 82.41], type: "sine", lfo: .035, cue: "crackle", interval: 3.7 },
  beach:        { noise: .11, filter: 740, filterType: "lowpass", tones: [65.41, 98], type: "sine", lfo: .025, cue: "wave", interval: 6.5 },
  layered:      { noise: .09, filter: 620, filterType: "bandpass", tones: [65.41, 98, 130.81], type: "sine", lfo: .05, cue: "crackle", interval: 4.6 },
  shatter:      { noise: .02, filter: 1600, filterType: "highpass", tones: [98, 146.83, 220], type: "sine", lfo: .05, cue: "glassBreak", interval: 12 },
  cube:         { noise: .028, filter: 420, filterType: "lowpass", tones: [73.42, 110, 146.83], type: "triangle", lfo: .07, cue: "cubeBounce", interval: 5.5 }
};

function createNoiseBuffer(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * .65;
  return buffer;
}

function setTarget(parameter, value, context, seconds = .4) {
  const now = context.currentTime;
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(value, now, Math.max(.015, seconds / 3));
}

export function createAmbientScene(sceneId, context, destination) {
  const profile = PROFILES[sceneId] || PROFILES.starfield;
  const bus = context.createGain(); bus.gain.value = 0; bus.connect(destination);
  const sources = [];
  const noiseBuffer = createNoiseBuffer(context);
  const noise = context.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
  const filter = context.createBiquadFilter(); filter.type = profile.filterType; filter.frequency.value = profile.filter; filter.Q.value = profile.filterType === "bandpass" ? .45 : .7;
  const noiseGain = context.createGain(); noiseGain.gain.value = profile.noise * .42;
  noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(bus); noise.start(); sources.push(noise);

  const toneGains = [];
  profile.tones.forEach((frequency, index) => {
    const oscillator = context.createOscillator(); oscillator.type = profile.type; oscillator.frequency.value = frequency; oscillator.detune.value = index === 0 ? -2 : index * 2;
    const gain = context.createGain(); gain.gain.value = (index === 0 ? .013 : .008) / Math.sqrt(profile.tones.length);
    oscillator.connect(gain); gain.connect(bus); oscillator.start(); sources.push(oscillator); toneGains.push(gain.gain);
  });
  const lfo = context.createOscillator(); lfo.type = "sine"; lfo.frequency.value = profile.lfo;
  const lfoGain = context.createGain(); lfoGain.gain.value = .004;
  lfo.connect(lfoGain); toneGains.forEach(gain => lfoGain.connect(gain)); lfo.start(); sources.push(lfo);

  let stopped = false;
  let cueTimer = null;
  const scheduleCue = () => {
    if (stopped) return;
    if (profile.cue && Math.random() < .76) trigger(profile.cue);
    cueTimer = setTimeout(scheduleCue, profile.interval * 1000 * (.82 + Math.random() * .44));
  };

  function fadeTo(value, seconds = .7) { if (!stopped) setTarget(bus.gain, value, context, seconds); }
  function trigger(kind = profile.cue) {
    if (stopped || !context || context.state === "closed") return;
    const now = context.currentTime;
    const playTone = (frequency, endFrequency, duration, level, wave = "sine", delay = 0) => {
      const osc = context.createOscillator(); const env = context.createGain();
      osc.type = wave; osc.frequency.setValueAtTime(frequency, now + delay);
      if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + delay + duration);
      env.gain.setValueAtTime(.0001, now + delay); env.gain.exponentialRampToValueAtTime(Math.max(.0002, level), now + delay + .04);
      env.gain.exponentialRampToValueAtTime(.0001, now + delay + duration);
      osc.connect(env); env.connect(bus); osc.start(now + delay); osc.stop(now + delay + duration + .04);
    };
    const playNoise = (duration, level, cutoff, type = "lowpass") => {
      const source = context.createBufferSource(); source.buffer = noiseBuffer;
      const toneFilter = context.createBiquadFilter(); toneFilter.type = type; toneFilter.frequency.value = cutoff;
      const env = context.createGain(); env.gain.setValueAtTime(.0001, now); env.gain.exponentialRampToValueAtTime(Math.max(.0002, level), now + Math.min(.2, duration * .2)); env.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.connect(toneFilter); toneFilter.connect(env); env.connect(bus); source.start(now); source.stop(now + duration + .05);
    };
    switch (kind) {
      case "bell": playTone(587.33, 493.88, .8, .024); break;
      case "softChord": playTone(392, 392, 1.5, .008); playTone(493.88, 493.88, 1.8, .007, "sine", .02); playTone(587.33, 587.33, 1.6, .006, "sine", .04); break;
      case "softChime": playTone(659.25, 523.25, 1.15, .015); playTone(783.99, 659.25, 1.4, .008, "sine", .07); break;
      case "twinkle": playTone(987.77, 739.99, .48, .009); break;
      case "waterDrop": playTone(528, 350, .35, .012); break;
      case "bubble": playTone(160, 110, .58, .009, "sine"); break;
      case "wind": case "whoosh": playNoise(1.8, .012, kind === "wind" ? 360 : 700, "lowpass"); break;
      case "windChime": playTone(740, 880, 1.1, .009); playTone(554.37, 659.25, 1.3, .006, "sine", .16); break;
      case "firework": playNoise(1.1, .009, 330, "lowpass"); playTone(92.5, 61.74, .65, .006); break;
      case "crackle": playNoise(.18 + Math.random() * .14, .013, 1900, "bandpass"); break;
      case "wave": playNoise(2.5, .018, 580, "lowpass"); break;
      case "digitalTick": playTone(760, 690, .055, .004, "sine"); break;
      case "keyboard": playTone(510 + Math.random() * 170, 450, .045, .003, "sine"); break;
      case "clockTick": playTone(920, 680, .06, .0035, "sine"); break;
      case "pixelChime": playTone(440, 392, .7, .007, "triangle"); break;
      case "glassBreak": {
        // Soft glass chime: a bright filtered noise spray plus three high
        // ring-down tones, kept well below the master limiter threshold.
        playNoise(.5, .014, 3200, "highpass");
        playTone(1760, 1240, .5, .006, "sine");
        playTone(2210, 1660, .42, .0045, "sine", .05);
        playTone(2630, 1980, .34, .0035, "sine", .11);
        break;
      }
      case "cubeBounce": playTone(196, 110, .3, .012, "triangle"); playTone(784, 588, .18, .004, "sine", .02); break;
      default: playTone(440, 392, .7, .006); break;
    }
  }

  cueTimer = setTimeout(scheduleCue, profile.interval * 1000 * (.8 + Math.random() * .4));
  return {
    fadeTo,
    trigger,
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(cueTimer);
      const now = context.currentTime;
      try {
        bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(.0001, now, .035);
        sources.forEach(source => { try { source.stop(now + .18); } catch { /* already stopped */ } });
        setTimeout(() => { try { bus.disconnect(); } catch {} }, 500);
      } catch { try { bus.disconnect(); } catch {} }
    }
  };
}
