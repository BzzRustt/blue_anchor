'use client'

import { useRef, useEffect } from 'react'

export interface DailyCount {
  date: string  // YYYY-MM-DD
  count: number
}

const LINE_COLOR = '#1D9E75'
const FILL_COLOR = 'rgba(29, 158, 117, 0.08)'
const GRID_COLOR = '#f1f5f9'
const LABEL_COLOR = '#94a3b8'
const CHART_HEIGHT = 180 // CSS px

export default function ScanChart({ data }: { data: DailyCount[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length < 2) return

    function draw() {
      if (!canvas) return
      const W = canvas.offsetWidth
      const H = CHART_HEIGHT
      if (W === 0) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = W * dpr
      canvas.height = H * dpr

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      // Layout
      const PAD = { top: 12, right: 12, bottom: 36, left: 38 }
      const plotW = W - PAD.left - PAD.right
      const plotH = H - PAD.top - PAD.bottom

      const counts = data.map((d) => d.count)
      const maxVal = Math.max(...counts, 1)
      // Round up to a clean axis maximum
      const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)))
      const yMax = Math.ceil(maxVal / magnitude) * magnitude || 5

      const xStep = plotW / (data.length - 1)
      const toX = (i: number) => PAD.left + i * xStep
      const toY = (v: number) => PAD.top + plotH * (1 - v / yMax)

      // Clear
      ctx.clearRect(0, 0, W, H)

      // Horizontal grid lines + y-axis labels
      const gridCount = 4
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.textAlign = 'right'
      for (let i = 0; i <= gridCount; i++) {
        const y = PAD.top + (plotH / gridCount) * i
        const val = Math.round(yMax - (yMax / gridCount) * i)

        ctx.strokeStyle = GRID_COLOR
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD.left, y)
        ctx.lineTo(W - PAD.right, y)
        ctx.stroke()

        ctx.fillStyle = LABEL_COLOR
        ctx.fillText(String(val), PAD.left - 6, y + 3.5)
      }

      // Area fill
      ctx.beginPath()
      ctx.moveTo(toX(0), toY(data[0].count))
      for (let i = 1; i < data.length; i++) ctx.lineTo(toX(i), toY(data[i].count))
      ctx.lineTo(toX(data.length - 1), PAD.top + plotH)
      ctx.lineTo(toX(0), PAD.top + plotH)
      ctx.closePath()
      ctx.fillStyle = FILL_COLOR
      ctx.fill()

      // Line
      ctx.beginPath()
      ctx.moveTo(toX(0), toY(data[0].count))
      for (let i = 1; i < data.length; i++) ctx.lineTo(toX(i), toY(data[i].count))
      ctx.strokeStyle = LINE_COLOR
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()

      // Dots
      for (let i = 0; i < data.length; i++) {
        ctx.beginPath()
        ctx.arc(toX(i), toY(data[i].count), 3.5, 0, Math.PI * 2)
        ctx.fillStyle = LINE_COLOR
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // X-axis date labels — show every other day so they don't crowd
      const step = data.length > 7 ? 2 : 1
      ctx.textAlign = 'center'
      ctx.fillStyle = LABEL_COLOR
      for (let i = 0; i < data.length; i += step) {
        const d = new Date(data[i].date + 'T00:00:00Z')
        const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
        ctx.fillText(label, toX(i), PAD.top + plotH + 20)
      }
    }

    draw()

    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [data])

  return (
    <canvas
      ref={canvasRef}
      className="w-full block"
      style={{ height: CHART_HEIGHT }}
    />
  )
}
