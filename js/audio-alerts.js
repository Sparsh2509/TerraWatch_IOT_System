/**
 * TerraWatch - Web Audio Buzzer & Siren Synthesizer
 * Uses the standard Web Audio API to reproduce the physical ESP32 piezoelectric buzzer
 * and early warning alarm without needing external MP3 files.
 */

class AudioAlertService {
  constructor() {
    this.audioCtx = null;
    this.isEnabled = false;
    this.isMuted = false;
    this.activeOscillator = null;
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.ensureContext();
    return this.isMuted;
  }

  playWarningBeep() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(880.00, now + 0.12); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playCriticalAlarm() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      // Dual tone rapid pulsing siren
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.linearRampToValueAtTime(1400, now + 0.15);
      osc.frequency.linearRampToValueAtTime(950, now + 0.30);
      osc.frequency.linearRampToValueAtTime(1400, now + 0.45);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.50);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.60);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    } catch (e) {
      console.warn('Audio alarm play failed', e);
    }
  }
}

window.TerraWatchAudio = new AudioAlertService();
