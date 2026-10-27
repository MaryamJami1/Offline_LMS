// A coarse audio level bar, shared by the teacher and student spike windows.
//
// It exists so "nobody can hear me" can be split into its three causes without
// a terminal: no mic (teacher bar flat), nothing arriving (student bar flat
// while the teacher's moves), or nothing reaching the headset (both bars move).
//
// Throwaway Phase 0 spike code. Not test-first, never shipped.

/* global AudioContext, MediaStream, requestAnimationFrame, window */

// Chromium garbage-collects an AudioContext that nothing refers to any more,
// and the meter then reads silence while the audio itself keeps playing
// perfectly. The frame loop below never mentions the context or the source
// node, so V8 does not keep them alive for it: this list does.
const liveMeters = [];

window.createLevelMeter = function createLevelMeter(stream, barEl, labelEl) {
  const context = new AudioContext();
  // With autoplay-policy=no-user-gesture-required (set in both main.js files) a
  // context starts running; resume() covers the case where it does not.
  void context.resume();

  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  liveMeters.push({ context, source, stream });

  const samples = new Float32Array(analyser.fftSize);
  let peak = 0;

  function frame() {
    analyser.getFloatTimeDomainData(samples);
    let sumOfSquares = 0;
    for (const sample of samples) sumOfSquares += sample * sample;
    const rms = Math.sqrt(sumOfSquares / samples.length);

    // Hold and decay the peak, or a 60 Hz bar is a blur from across the room.
    peak = Math.max(rms, peak * 0.9);
    const dbfs = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

    // -60 dBFS (silence) to 0 dBFS (clipping) across the width of the bar.
    const percent = Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100));
    barEl.style.width = `${percent.toFixed(1)}%`;
    barEl.classList.toggle('hot', dbfs > -3);
    if (labelEl) labelEl.textContent = dbfs === -Infinity ? 'silent' : `${Math.round(dbfs)} dBFS`;

    requestAnimationFrame(frame);
  }
  frame();
};
