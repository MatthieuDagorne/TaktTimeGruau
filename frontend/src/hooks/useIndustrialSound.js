// Industrial Sound Generator for Automotive Environment
// Uses Web Audio API to generate clear, professional sounds

class IndustrialSoundManager {
  constructor() {
    this.audioContext = null;
    this.enabled = false;
    this.masterGain = null;
  }

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.8; // Master volume increased for industrial environment
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.enabled = true;
  }

  enable() {
    this.init();
    return this;
  }

  disable() {
    this.enabled = false;
  }

  setVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Create a beep with specific parameters
  createTone(frequency, duration, type = 'sine', volume = 0.5) {
    if (!this.enabled || !this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.02);
    gainNode.gain.setValueAtTime(volume, now + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // TAKT START / RESUME - Ascending horn signal (long and clear)
  // Used for: manual start, auto-start, resume after pause
  playTaktStart() {
    if (!this.enabled || !this.audioContext) return;
    
    // Three ascending tones - longer and louder for industrial environment
    // Similar to factory start siren
    const tones = [
      { freq: 440, delay: 0, duration: 0.5 },      // A4
      { freq: 554, delay: 400, duration: 0.5 },    // C#5
      { freq: 659, delay: 800, duration: 0.8 },    // E5 - longer final tone
    ];
    
    tones.forEach(({ freq, delay, duration }) => {
      setTimeout(() => {
        this.createTone(freq, duration, 'square', 0.5);
      }, delay);
    });
  }

  // TAKT WARNING - Rapid alert beeps (urgent)
  // Used for: X minutes before takt end
  playTaktWarning() {
    if (!this.enabled || !this.audioContext) return;
    
    // Five rapid beeps - louder and more urgent
    const beepCount = 5;
    for (let i = 0; i < beepCount; i++) {
      setTimeout(() => {
        this.createTone(880, 0.2, 'square', 0.6);
      }, i * 250);
    }
  }

  // TAKT END - Descending horn (completion signal)
  // Used for: takt completed
  playTaktEnd() {
    if (!this.enabled || !this.audioContext) return;
    
    // Descending three-tone (opposite of start) - longer
    const tones = [
      { freq: 659, delay: 0, duration: 0.5 },      // E5
      { freq: 554, delay: 400, duration: 0.5 },    // C#5
      { freq: 440, delay: 800, duration: 0.8 },    // A4 - longer final tone
    ];
    
    tones.forEach(({ freq, delay, duration }) => {
      setTimeout(() => {
        this.createTone(freq, duration, 'square', 0.5);
      }, delay);
    });
  }

  // PAUSE/STOP - Low warning horn (work stopping)
  // Used for: manual pause, break start, production stop
  playPauseStart() {
    if (!this.enabled || !this.audioContext) return;
    
    // Two long low tones - clearly different from start
    // Low frequency = STOP signal
    const tones = [
      { freq: 330, delay: 0, duration: 0.6 },      // E4 (low)
      { freq: 262, delay: 500, duration: 0.8 },    // C4 (lower) - descending = stop
    ];
    
    tones.forEach(({ freq, delay, duration }) => {
      setTimeout(() => {
        this.createTone(freq, duration, 'sawtooth', 0.5);
      }, delay);
    });
  }

  // BREAK START - Melodic chime (pleasant, distinct from work sounds)
  playBreakStart() {
    if (!this.enabled || !this.audioContext) return;
    
    // Three ascending tones (like lunch bell) - longer
    const tones = [523, 659, 784]; // C5, E5, G5
    tones.forEach((freq, i) => {
      setTimeout(() => {
        this.createTone(freq, 0.4, 'sine', 0.5);
      }, i * 250);
    });
  }

  // BREAK WARNING - Gentle reminder beeps
  playBreakWarning() {
    if (!this.enabled || !this.audioContext) return;
    
    // Double soft beep - longer
    this.createTone(660, 0.2, 'sine', 0.4);
    setTimeout(() => {
      this.createTone(660, 0.2, 'sine', 0.4);
    }, 300);
  }

  // BREAK END / RESUME - Energetic return signal
  playBreakEnd() {
    if (!this.enabled || !this.audioContext) return;
    
    // Same as takt_start - work is resuming
    this.playTaktStart();
  }

  // Error/alert sound
  playError() {
    if (!this.enabled || !this.audioContext) return;
    
    // Harsh buzz - longer
    this.createTone(200, 0.8, 'sawtooth', 0.4);
  }

  // Generic notification
  playNotification() {
    if (!this.enabled || !this.audioContext) return;
    
    this.createTone(800, 0.2, 'sine', 0.4);
  }

  // Play sound by type
  play(type) {
    switch (type) {
      case 'takt_start':
        this.playTaktStart();
        break;
      case 'takt_warning':
        this.playTaktWarning();
        break;
      case 'takt_end':
        this.playTaktEnd();
        break;
      case 'pause_start':      // New: for manual pause
        this.playPauseStart();
        break;
      case 'break_start':
        this.playBreakStart();
        break;
      case 'break_warning':
        this.playBreakWarning();
        break;
      case 'break_end':
        this.playBreakEnd();
        break;
      case 'error':
        this.playError();
        break;
      default:
        this.playNotification();
    }
  }
}

// Singleton instance
export const soundManager = new IndustrialSoundManager();

// React hook for sound
export const useIndustrialSound = () => {
  const enable = () => soundManager.enable();
  const disable = () => soundManager.disable();
  const play = (type) => soundManager.play(type);
  const setVolume = (vol) => soundManager.setVolume(vol);

  return { enable, disable, play, setVolume, isEnabled: () => soundManager.enabled };
};
