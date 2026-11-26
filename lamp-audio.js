(() => {
  if (!window.AudioContext) return;

  // Lamp audio volume (0 = silent, 1 = full recording level).
  const LAMP_STARTUP_VOLUME = .45; // Switch-on and bulb warm-up
  const LAMP_HUM_VOLUME = .35;     // Continuous background hum
  const FADE_OUT_SECONDS = .2;
  const HANDOFF_SECONDS = .12;
  const STARTUP_FILE = './audio-fx/lamp-startup.mp3';
  const HUM_FILE = './audio-fx/lamp-hum.mp3';

  const buffers = new Map();
  const startupBytes = fetchAudio(STARTUP_FILE).catch(() => null);
  let context;
  let lampPlayback = null;
  let availableAt = 0;

  async function fetchAudio(file) {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Audio file returned HTTP ${response.status}`);
    return response.arrayBuffer();
  }

  function loadBuffer(file) {
    if (!buffers.has(file)) {
      const bytes = file === STARTUP_FILE
        ? startupBytes.then(preloaded => preloaded?.slice(0) ?? fetchAudio(file))
        : fetchAudio(file);
      const buffer = bytes
        .then(data => context.decodeAudioData(data))
        .catch(error => {
          buffers.delete(file);
          console.warn(`Could not load ${file}.`, error);
          return null;
        });
      buffers.set(file, buffer);
    }
    return buffers.get(file);
  }

  function prepareContext() {
    try {
      context ??= new AudioContext();
    } catch {
      // The lamp switch remains usable when the audio device is unavailable.
    }
  }

  function unlockAudio() {
    if (context && context.state !== 'running') {
      return context.resume().catch(() => {});
    }
  }

  function playBuffer(playback, buffer, level, at, loop = false) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(playback.output);
    source.start(at);
    playback.sources.add(source);
    source.onended = () => {
      playback.sources.delete(source);
      source.disconnect();
      gain.disconnect();
      if (!playback.sources.size && lampPlayback !== playback) playback.output.disconnect();
    };
    return gain.gain;
  }

  async function startAudio(playback) {
    prepareContext();
    if (!context) return;
    const audioReady = unlockAudio();

    const startupReady = loadBuffer(STARTUP_FILE);
    const humReady = loadBuffer(HUM_FILE);
    const startup = await startupReady;
    await audioReady;
    if (!startup || lampPlayback !== playback || context.state !== 'running') return;

    playback.startAt = Math.max(context.currentTime, availableAt);
    playback.output = context.createGain();
    playback.output.connect(context.destination);
    const startupLevel = playBuffer(playback, startup, LAMP_STARTUP_VOLUME, playback.startAt);

    const hum = await humReady;
    if (!hum || lampPlayback !== playback) return;

    const startupEnd = playback.startAt + startup.duration;
    const handoff = Math.max(context.currentTime, playback.startAt, startupEnd - HANDOFF_SECONDS);
    const humLevel = playBuffer(playback, hum, 0, handoff, true);
    humLevel.setValueAtTime(0, handoff);
    if (handoff < startupEnd) {
      startupLevel.setValueAtTime(LAMP_STARTUP_VOLUME, handoff);
      startupLevel.linearRampToValueAtTime(0, startupEnd);
    }
    humLevel.linearRampToValueAtTime(LAMP_HUM_VOLUME, Math.max(startupEnd, handoff + .02));
  }

  function stopAudio(playback) {
    if (!playback.sources.size) {
      playback.output?.disconnect();
      return;
    }

    const now = context.currentTime;
    const playing = context.state === 'running' && now >= playback.startAt;
    const stopAt = playing ? now + FADE_OUT_SECONDS : now;
    playback.output.gain.setValueAtTime(1, now);
    playback.output.gain.linearRampToValueAtTime(0, stopAt);
    playback.sources.forEach(source => source.stop(stopAt));
    availableAt = Math.max(availableAt, stopAt);
  }

  if (window.requestIdleCallback) {
    window.requestIdleCallback(prepareContext);
  } else {
    setTimeout(prepareContext, 0);
  }

  // The button's animated tug finishes after the original click gesture.
  document.querySelector('#toggle').addEventListener('click', unlockAudio);
  window.addEventListener('lampchange', ({ detail: lit }) => {
    const previous = lampPlayback;
    const next = lit ? { sources: new Set(), output: null, startAt: Infinity } : null;
    lampPlayback = next;
    if (lit) unlockAudio();

    // Let the theme update paint before starting or stopping the audio graph.
    requestAnimationFrame(() => setTimeout(() => {
      if (previous) stopAudio(previous);
      if (next && next === lampPlayback) {
        startAudio(next).catch(error => console.warn('Could not play lamp audio.', error));
      }
    }, 0));
  });
})();
