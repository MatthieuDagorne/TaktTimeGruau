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
      this.masterGain.gain.value = 0.5; // Master volume
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
  createTone(frequency, duration, type = 'sine', volume = 0.3) {
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

  // Industrial horn sound - single long tone (for takt start)
  playTaktStart() {
    if (!this.enabled || !this.audioContext) return;
    
    // Two-tone ascending horn (like factory start signal)
    const now = this.audioContext.currentTime;
    
    // First tone - lower
    this.createTone(440, 0.3, 'square', 0.2);
    
    // Second tone - higher (after small delay)
    setTimeout(() => {
      this.createTone(554, 0.4, 'square', 0.25);
    }, 250);
  }

  // Warning beeps - rapid pulses (before takt end)
  playTaktWarning() {
    if (!this.enabled || !this.audioContext) return;
    
    // Triple beep warning (like forklift backup warning)
    const beep = (delay) => {
      setTimeout(() => {
        this.createTone(880, 0.15, 'square', 0.3);
      }, delay);
    };
    
    beep(0);
    beep(200);
    beep(400);
  }

  // Takt end - descending horn (signals completion)
  playTaktEnd() {
    if (!this.enabled || !this.audioContext) return;
    
    // Descending two-tone (opposite of start)
    this.createTone(554, 0.3, 'square', 0.25);
    
    setTimeout(() => {
      this.createTone(440, 0.5, 'square', 0.2);
    }, 250);
  }

  // Break start - melodic chime (pleasant, distinct from work sounds)
  playBreakStart() {
    if (!this.enabled || !this.audioContext) return;
    
    // Three ascending tones (like lunch bell)
    const tones = [523, 659, 784]; // C5, E5, G5
    tones.forEach((freq, i) => {
      setTimeout(() => {
        this.createTone(freq, 0.25, 'sine', 0.25);
      }, i * 150);
    });
  }

  // Break warning - gentle reminder beeps
  playBreakWarning() {
    if (!this.enabled || !this.audioContext) return;
    
    // Double soft beep
    this.createTone(660, 0.1, 'sine', 0.2);
    setTimeout(() => {
      this.createTone(660, 0.1, 'sine', 0.2);
    }, 150);
  }

  // Break end - energetic return signal
  playBreakEnd() {
    if (!this.enabled || !this.audioContext) return;
    
    // Ascending fanfare (back to work)
    const tones = [392, 494, 587, 784]; // G4, B4, D5, G5
    tones.forEach((freq, i) => {
      setTimeout(() => {
        this.createTone(freq, 0.15, 'square', 0.2);
      }, i * 100);
    });
  }

  // Error/alert sound
  playError() {
    if (!this.enabled || !this.audioContext) return;
    
    // Harsh buzz
    this.createTone(200, 0.5, 'sawtooth', 0.2);
  }

  // Generic notification
  playNotification() {
    if (!this.enabled || !this.audioContext) return;
    
    this.createTone(800, 0.1, 'sine', 0.2);
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
