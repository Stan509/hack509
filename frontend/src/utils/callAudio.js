// Web Audio Synthesizer for Call Center Sounds

class CallAudioEngine {
  constructor() {
    this.ctx = null
    this.dialingInterval = null
    this.isPlayingDialing = false
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  // 1. Son d'Appel Lancé (Dialing / Ringback tone - US/EU dual tone)
  startDialingSound() {
    this.init()
    if (!this.ctx || this.isPlayingDialing) return
    this.isPlayingDialing = true

    const playPulse = () => {
      if (!this.isPlayingDialing || !this.ctx) return
      try {
        const osc1 = this.ctx.createOscillator()
        const osc2 = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc1.type = 'sine'
        osc2.type = 'sine'
        osc1.frequency.value = 440 // 440 Hz
        osc2.frequency.value = 480 // 480 Hz

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.8)

        osc1.connect(gain)
        osc2.connect(gain)
        gain.connect(this.ctx.destination)

        osc1.start()
        osc2.start()
        osc1.stop(this.ctx.currentTime + 1.8)
        osc2.stop(this.ctx.currentTime + 1.8)
      } catch (err) {
        console.warn('Audio pulse error:', err)
      }
    }

    playPulse()
    this.dialingInterval = setInterval(playPulse, 3000)
  }

  stopDialingSound() {
    this.isPlayingDialing = false
    if (this.dialingInterval) {
      clearInterval(this.dialingInterval)
      this.dialingInterval = null
    }
  }

  // 2. Son d'Appel Connecté (Call Connected Chime - ascending notes)
  playConnectedSound() {
    this.stopDialingSound()
    this.init()
    if (!this.ctx) return

    try {
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now) // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15) // E5

      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.4)
    } catch (err) {
      console.warn('Connected audio error:', err)
    }
  }

  // 3. Son d'Appel Terminé (Call Ended Chime - descending notes)
  playEndedSound() {
    this.stopDialingSound()
    this.init()
    if (!this.ctx) return

    try {
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, now) // A4
      osc.frequency.setValueAtTime(220, now + 0.12) // A3

      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.35)
    } catch (err) {
      console.warn('Ended audio error:', err)
    }
  }
}

export const callAudio = new CallAudioEngine()
