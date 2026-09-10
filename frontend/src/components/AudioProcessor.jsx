import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import useAudio from '../hooks/useAudio.js'

function VUMeter({ level }) {
  const numBars = 16
  const bars = Array.from({ length: numBars }, (_, i) => {
    const threshold = i / numBars
    const active = level > threshold
    let color = '#00ff66'
    if (i > 11) color = '#ff2244'
    else if (i > 8) color = '#ff9900'
    return { active, color }
  })

  return (
    <div className="flex items-end gap-0.5 h-10">
      {bars.map((bar, i) => (
        <motion.div
          key={i}
          animate={{ height: bar.active ? `${(i + 1) * 6}px` : '4px', opacity: bar.active ? 1 : 0.15 }}
          transition={{ duration: 0.05 }}
          style={{
            width: '8px',
            background: bar.active ? bar.color : '#1a1a1a',
            boxShadow: bar.active ? `0 0 4px ${bar.color}` : 'none',
            borderRadius: '1px',
          }}
        />
      ))}
    </div>
  )
}

function ToggleSwitch({ label, value, onChange, description }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-neon-green border-opacity-5">
      <div>
        <div className="text-text-terminal text-xs font-mono">{label}</div>
        {description && <div className="text-text-muted text-xs font-mono mt-0.5" style={{ fontSize: '0.6rem' }}>{description}</div>}
      </div>
      <button
        onClick={onChange}
        className="relative w-10 h-5 rounded-full transition-all duration-200 flex-shrink-0"
        style={{
          background: value ? 'rgba(0,255,102,0.3)' : 'rgba(61,90,61,0.3)',
          border: `1px solid ${value ? '#00ff66' : '#3d5a3d'}`,
          boxShadow: value ? '0 0 8px rgba(0,255,102,0.4)' : 'none',
        }}
      >
        <motion.div
          animate={{ x: value ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute top-0.5 w-4 h-4 rounded-full"
          style={{ background: value ? '#00ff66' : '#3d5a3d', boxShadow: value ? '0 0 6px #00ff66' : 'none' }}
        />
      </button>
    </div>
  )
}

export default function AudioProcessor() {
  const {
    devices,
    selectedDeviceId,
    isActive,
    audioLevel,
    settings,
    getDevices,
    startStream,
    stopStream,
    selectDevice,
    toggleNoiseSuppression,
    toggleEchoCancel,
    toggleHighpass,
    toggleAutoGain,
  } = useAudio()

  useEffect(() => {
    getDevices()
  }, [])

  return (
    <div className="card-cyber rounded p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="terminal-header mb-0.5">Audio Pipeline</div>
          <h3 className="text-text-terminal text-sm font-mono font-semibold">AUDIO PROCESSOR</h3>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1 rounded text-xs font-mono"
          style={{
            background: isActive ? 'rgba(0,255,102,0.1)' : 'rgba(61,90,61,0.1)',
            border: `1px solid ${isActive ? '#00ff66' : '#3d5a3d'}`,
            color: isActive ? '#00ff66' : '#3d5a3d',
          }}
        >
          <span
            className="status-dot"
            style={{
              background: isActive ? '#00ff66' : '#3d5a3d',
              boxShadow: isActive ? '0 0 6px #00ff66' : 'none',
              animation: isActive ? 'pulse-dot 1.5s infinite' : 'none',
            }}
          />
          {isActive ? 'PIPELINE ACTIVE' : 'INACTIVE'}
        </div>
      </div>

      {/* VU Meter */}
      <div>
        <div className="terminal-header mb-2">Audio Level</div>
        <VUMeter level={audioLevel} />
        <div className="text-text-muted text-xs font-mono mt-1" style={{ fontSize: '0.6rem' }}>
          RMS: {(audioLevel * 100).toFixed(1)}%
        </div>
      </div>

      {/* Device selector */}
      <div>
        <div className="terminal-header mb-2">Input Device</div>
        <select
          value={selectedDeviceId || ''}
          onChange={(e) => selectDevice(e.target.value || null)}
          className="input-cyber w-full px-3 py-2 text-xs rounded-sm"
          style={{ background: '#080808' }}
        >
          <option value="">DEFAULT MICROPHONE</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `DEVICE_${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </div>

      {/* DSP Settings */}
      <div>
        <div className="terminal-header mb-2">DSP Filters</div>
        <ToggleSwitch
          label="Noise Suppression"
          description="Background noise reduction"
          value={settings.noiseSuppression}
          onChange={toggleNoiseSuppression}
        />
        <ToggleSwitch
          label="Echo Cancellation"
          description="Acoustic echo removal"
          value={settings.echoCancellation}
          onChange={toggleEchoCancel}
        />
        <ToggleSwitch
          label="High-Pass Filter (80Hz)"
          description="Remove low-freq rumble"
          value={settings.highpassFilter}
          onChange={toggleHighpass}
        />
        <ToggleSwitch
          label="Auto Gain Control"
          description="Normalize input volume"
          value={settings.autoGainControl}
          onChange={toggleAutoGain}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={isActive ? stopStream : startStream}
          className={`btn-cyber flex-1 py-2 text-xs rounded-sm ${isActive ? 'btn-danger' : ''}`}
        >
          {isActive ? '⏹ STOP PIPELINE' : '▶ START PIPELINE'}
        </button>
        <button
          onClick={getDevices}
          className="btn-cyber px-3 py-2 text-xs rounded-sm"
        >
          ↻
        </button>
      </div>
    </div>
  )
}
