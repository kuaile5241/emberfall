/** Original project audio. Voice count and per-event gates prevent noisy stacking. */
export class GameAudio {
  constructor({ volume = 0.8, muted = false } = {}) {
    this.volume = volume;
    this.muted = muted;
    this.running = false;
    this.voices = [];
    this.lastPlayed = new Map();
    this.ambient = new Audio('/assets/audio/ambience.ogg');
    this.ambient.loop = true;
    this.ambient.preload = 'auto';
    this.applyVolume();
  }

  applyVolume() {
    this.ambient.volume = this.muted ? 0 : this.volume * 0.28;
    for (const voice of this.voices) voice.audio.volume = this.muted ? 0 : this.volume * voice.gain;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    this.applyVolume();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.applyVolume();
    if (!this.muted && this.running) this.ambient.play().catch(() => {});
  }

  setRunning(value) {
    this.running = Boolean(value);
    if (this.running) {
      if (!this.muted) this.ambient.play().catch(() => {});
    } else {
      this.ambient.pause();
      this.stopEffects();
    }
  }

  stopEffects() {
    for (const { audio } of this.voices) audio.pause();
    this.voices = [];
  }

  play(name, { gain = 0.4, rate = 1, element = 'fire' } = {}) {
    if (name === 'skill') name = `skill-${['fire', 'lightning', 'water'].includes(element) ? element : 'fire'}`;
    if (name === 'slash' && element === 'lightning') rate *= 1.13;
    if (name === 'slash' && element === 'water') rate *= .85;
    if (this.muted || this.volume === 0 || !this.running) return;
    const now = performance.now();
    const gate = name === 'pickup' ? 130 : name === 'hit' ? 70 : 55;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < gate) return;
    this.lastPlayed.set(name, now);
    this.voices = this.voices.filter(voice => !voice.audio.ended && !voice.audio.paused);
    if (this.voices.length >= 8) this.voices.shift().audio.pause();
    const audio = new Audio(`/assets/audio/${name}.wav`);
    audio.volume = Math.min(1, gain * this.volume);
    audio.playbackRate = rate;
    this.voices.push({ audio, gain });
    audio.play().catch(() => {});
  }
}
