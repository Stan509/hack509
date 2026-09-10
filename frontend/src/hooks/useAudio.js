import { useState, useRef, useCallback, useEffect } from 'react'

const useAudio = () => {
  const [stream, setStream] = useState(null)
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [isActive, setIsActive] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [settings, setSettings] = useState({
    noiseSuppression: true,
    echoCancellation: true,
    highpassFilter: true,
    autoGainControl: true,
  })

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const filterRef = useRef(null)
  const compressorRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)

  const getDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const inputs = allDevices.filter((d) => d.kind === 'audioinput')
      setDevices(inputs)
      return inputs
    } catch {
      return []
    }
  }, [])

  const stopStream = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close()
    }
    audioContextRef.current = null
    analyserRef.current = null
    sourceRef.current = null
    filterRef.current = null
    compressorRef.current = null
    setStream(null)
    setIsActive(false)
    setAudioLevel(0)
  }, [])

  const startStream = useCallback(async (deviceId = null) => {
    stopStream()
    try {
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = mediaStream
      setStream(mediaStream)

      // Build audio processing chain
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 })
      audioContextRef.current = ctx

      // MediaStreamSource
      const source = ctx.createMediaStreamSource(mediaStream)
      sourceRef.current = source

      // Highpass filter (removes low-frequency rumble below 80Hz)
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 80
      filter.Q.value = 0.7
      filterRef.current = filter

      // Dynamics compressor (normalize volume)
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-24, ctx.currentTime)
      compressor.knee.setValueAtTime(30, ctx.currentTime)
      compressor.ratio.setValueAtTime(12, ctx.currentTime)
      compressor.attack.setValueAtTime(0.003, ctx.currentTime)
      compressor.release.setValueAtTime(0.25, ctx.currentTime)
      compressorRef.current = compressor

      // Analyser for VU meter
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      // Connect: source → filter → compressor → analyser → destination
      if (settings.highpassFilter) {
        source.connect(filter)
        filter.connect(compressor)
      } else {
        source.connect(compressor)
      }
      compressor.connect(analyser)
      analyser.connect(ctx.destination)

      setIsActive(true)

      // VU meter animation loop
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / dataArray.length)
        setAudioLevel(Math.min(rms * 4, 1))
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()

      // Enumerate devices after permission granted
      await getDevices()
      return { success: true }
    } catch (err) {
      console.warn('[AudioProcessor] Failed:', err)
      return { success: false, error: err.message }
    }
  }, [settings, getDevices, stopStream])

  const selectDevice = useCallback(async (deviceId) => {
    setSelectedDeviceId(deviceId)
    if (isActive) {
      await startStream(deviceId)
    }
  }, [isActive, startStream])

  const toggleSetting = useCallback((key) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      return next
    })
  }, [])

  // When settings change and stream is active, restart
  useEffect(() => {
    if (isActive) {
      startStream(selectedDeviceId)
    }
  }, [settings])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStream()
  }, [])

  return {
    stream,
    devices,
    selectedDeviceId,
    isActive,
    audioLevel,
    settings,
    analyser: analyserRef.current,
    getDevices,
    startStream: () => startStream(selectedDeviceId),
    stopStream,
    selectDevice,
    toggleNoiseSuppression: () => toggleSetting('noiseSuppression'),
    toggleEchoCancel: () => toggleSetting('echoCancellation'),
    toggleHighpass: () => toggleSetting('highpassFilter'),
    toggleAutoGain: () => toggleSetting('autoGainControl'),
  }
}

export default useAudio
