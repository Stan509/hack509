import { motion } from 'framer-motion'

const OUTCOMES = [
  { key: 'answered',     label: 'ANSWERED',    icon: '✓', color: '#00ff66', bg: 'rgba(0,255,102,0.1)' },
  { key: 'busy',         label: 'BUSY',         icon: '⚡', color: '#ff9900', bg: 'rgba(255,153,0,0.1)' },
  { key: 'voicemail',    label: 'VOICEMAIL',    icon: '✉', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  { key: 'no_answer',    label: 'NO ANSWER',    icon: '○', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  { key: 'wrong_number', label: 'WRONG #',      icon: '✗', color: '#ff9900', bg: 'rgba(255,153,0,0.1)' },
  { key: 'do_not_call',  label: 'DO NOT CALL',  icon: '⛔', color: '#ff2244', bg: 'rgba(255,34,68,0.1)' },
  { key: 'callback',     label: 'CALLBACK',     icon: '↩', color: '#00d4ff', bg: 'rgba(0,212,255,0.1)' },
]

export default function StatusTagger({ selected, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {OUTCOMES.map((outcome) => (
        <motion.button
          key={outcome.key}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(outcome.key)}
          className="flex items-center gap-2 px-3 py-2 rounded-sm font-mono text-xs font-semibold tracking-wider transition-all duration-150"
          style={{
            background: selected === outcome.key ? outcome.bg : 'transparent',
            border: `1px solid ${selected === outcome.key ? outcome.color : 'rgba(61,90,61,0.4)'}`,
            color: selected === outcome.key ? outcome.color : '#3d5a3d',
            boxShadow: selected === outcome.key ? `0 0 8px ${outcome.color}44` : 'none',
          }}
        >
          <span style={{ fontSize: '1rem' }}>{outcome.icon}</span>
          <span>{outcome.label}</span>
        </motion.button>
      ))}
    </div>
  )
}
