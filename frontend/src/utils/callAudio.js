// Web Audio Synthesizer for Call Center Sounds

class CallAudioEngine {
  constructor() {
    this.ctx = null
    this.dialingInterval = null
    this.isPlayingDialing = false
    this.holdInterval = null
    this.isPlayingHold = false
    this.ringInterval = null
    this.isPlayingRing = false
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
    this.stopHoldMusic()
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
    this.stopHoldMusic()
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

  // 4. Musique de Mise en Attente (Hold Music / Soothing Chime on Hold)
  startHoldMusic() {
    this.stopDialingSound()
    this.init()
    if (!this.ctx || this.isPlayingHold) return
    this.isPlayingHold = true

    // Chords: E major / C# minor soothing arpeggio notes
    const notes = [329.63, 392.00, 493.88, 587.33, 493.88, 392.00]
    let noteIndex = 0

    const playChordNote = () => {
      if (!this.isPlayingHold || !this.ctx) return
      try {
        const now = this.ctx.currentTime
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = 'sine'
        const freq = notes[noteIndex % notes.length]
        noteIndex++

        osc.frequency.setValueAtTime(freq, now)
        gain.gain.setValueAtTime(0.06, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9)

        osc.connect(gain)
        gain.connect(this.ctx.destination)

        osc.start(now)
        osc.stop(now + 0.9)
      } catch (err) {
        console.warn('Hold audio error:', err)
      }
    }

    playChordNote()
    this.holdInterval = setInterval(playChordNote, 1000)
  }

  stopHoldMusic() {
    this.isPlayingHold = false
    if (this.holdInterval) {
      clearInterval(this.holdInterval)
      this.holdInterval = null
    }
  }

  // 5. Sonnerie d'Appel Entrant / Transfert (Loud & Clear Telephone Ringtone)
  startIncomingCallRing() {
    this.stopDialingSound()
    this.stopHoldMusic()
    this.init()
    if (!this.ctx || this.isPlayingRing) return
    this.isPlayingRing = true

    const playRingCycle = () => {
      if (!this.isPlayingRing || !this.ctx) return
      try {
        const now = this.ctx.currentTime

        // Premier coup de sonnerie (440Hz + 480Hz pendant 0.5s)
        const osc1a = this.ctx.createOscillator()
        const osc2a = this.ctx.createOscillator()
        const gainA = this.ctx.createGain()

        osc1a.type = 'sine'
        osc2a.type = 'sine'
        osc1a.frequency.value = 440
        osc2a.frequency.value = 480

        gainA.gain.setValueAtTime(0.22, now)
        gainA.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

        osc1a.connect(gainA)
        osc2a.connect(gainA)
        gainA.connect(this.ctx.destination)

        osc1a.start(now)
        osc2a.start(now)
        osc1a.stop(now + 0.45)
        osc2a.stop(now + 0.45)

        // Deuxième coup de sonnerie (440Hz + 480Hz pendant 0.5s après 0.2s de silence)
        const osc1b = this.ctx.createOscillator()
        const osc2b = this.ctx.createOscillator()
        const gainB = this.ctx.createGain()

        osc1b.type = 'sine'
        osc2b.type = 'sine'
        osc1b.frequency.value = 440
        osc2b.frequency.value = 480

        gainB.gain.setValueAtTime(0.22, now + 0.65)
        gainB.gain.exponentialRampToValueAtTime(0.001, now + 1.1)

        osc1b.connect(gainB)
        osc2b.connect(gainB)
        gainB.connect(this.ctx.destination)

        osc1b.start(now + 0.65)
        osc2b.start(now + 0.65)
        osc1b.stop(now + 1.1)
        osc2b.stop(now + 1.1)
      } catch (err) {
        console.warn('Incoming ring audio error:', err)
      }
    }

    playRingCycle()
    this.ringInterval = setInterval(playRingCycle, 3000)
  }

  stopIncomingCallRing() {
    this.isPlayingRing = false
    if (this.ringInterval) {
      clearInterval(this.ringInterval)
      this.ringInterval = null
    }
  }
}

export const callAudio = new CallAudioEngine()
