import { useEffect, useRef } from 'react'

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン@#$%&*<>[]{}|'

export default function MatrixRain({ opacity = 1 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const fontSize = 14
    let columns = Math.floor(canvas.offsetWidth / fontSize)
    let drops = Array(columns).fill(1)
    let animId

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      columns = Math.floor(canvas.width / fontSize)
      drops = Array(columns).fill(1)
    }

    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      // Fade trail
      ctx.fillStyle = 'rgba(5, 5, 5, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Varying shades of green
        const brightness = Math.random()
        if (brightness > 0.98) {
          // Bright white-green leading character
          ctx.fillStyle = '#ffffff'
          ctx.shadowColor = '#00ff66'
          ctx.shadowBlur = 8
        } else if (brightness > 0.7) {
          ctx.fillStyle = '#00ff66'
          ctx.shadowColor = '#00ff66'
          ctx.shadowBlur = 4
        } else if (brightness > 0.4) {
          ctx.fillStyle = '#00cc44'
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
        } else {
          ctx.fillStyle = '#006622'
          ctx.shadowBlur = 0
        }

        ctx.font = `${fontSize}px 'Fira Code', monospace`
        ctx.fillText(char, x, y)

        // Reset drop to top with some randomness
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i]++
      }

      animId = setTimeout(() => requestAnimationFrame(draw), 40)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      clearTimeout(animId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity,
        display: 'block',
      }}
    />
  )
}
