import * as THREE from 'three'

/**
 * Canvas-drawn textures.
 *
 * Every label, sign, screen and hologram in the ship is painted here at runtime
 * so the world needs no external art files and every display is data-driven.
 */

const FONT = (size: number, weight = 'bold') =>
  `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

export function toTexture(canvas: HTMLCanvasElement, renderOrderToneMapped = false) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  if (!renderOrderToneMapped) tex.userData.toneMapped = false
  return tex
}

export function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The dark mission signage used above doors and project modules. */
export function signTexture(title: string, subtitle: string, accent = 0x5fd8f0) {
  const W = 1024
  const H = 320
  const { canvas, ctx } = makeCanvas(W, H)
  ctx.fillStyle = '#25282c'
  roundRect(ctx, 0, 0, W, H, 26)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 4
  roundRect(ctx, 6, 6, W - 12, H - 12, 22)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.font = FONT(52, '600')
  ctx.textBaseline = 'middle'
  ctx.fillText(title.toUpperCase(), 56, 92)

  ctx.fillStyle = '#ffffff'
  ctx.font = FONT(96, 'bold')
  ctx.fillText(subtitle.toUpperCase(), 52, 206)

  ctx.fillStyle = hex(accent)
  ctx.fillRect(56, 268, 180, 10)
  return toTexture(canvas)
}

/** Cream engraved plate for room names next to doors. */
export function plateTexture(text: string, sub = '') {
  const W = 768
  const H = 256
  const { canvas, ctx } = makeCanvas(W, H)
  ctx.fillStyle = '#e9e3d6'
  roundRect(ctx, 0, 0, W, H, 20)
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,64,68,0.35)'
  ctx.lineWidth = 5
  roundRect(ctx, 8, 8, W - 16, H - 16, 14)
  ctx.stroke()
  ctx.fillStyle = '#3a3e42'
  ctx.font = FONT(78, 'bold')
  ctx.textBaseline = 'middle'
  ctx.fillText(text.toUpperCase(), 46, sub ? 92 : H / 2)
  if (sub) {
    ctx.fillStyle = 'rgba(58,62,66,0.6)'
    ctx.font = FONT(44, '600')
    ctx.fillText(sub.toUpperCase(), 48, 172)
  }
  return toTexture(canvas)
}

/** A workstation / console screen showing fake engineering telemetry. */
export function screenTexture(
  accent: number,
  seed = 1,
  kind: 'code' | 'graph' | 'status' | 'log' = 'code',
) {
  const W = 512
  const H = 320
  const { canvas, ctx } = makeCanvas(W, H)
  ctx.fillStyle = '#0d1a20'
  ctx.fillRect(0, 0, W, H)
  const glow = hex(accent)
  ctx.fillStyle = glow
  ctx.globalAlpha = 0.12
  ctx.fillRect(0, 0, W, 34)
  ctx.globalAlpha = 1

  let s = seed * 9301
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)

  if (kind === 'code') {
    for (let i = 0; i < 13; i++) {
      const y = 62 + i * 19
      ctx.globalAlpha = 0.55 + rnd() * 0.4
      ctx.fillStyle = i % 4 === 0 ? glow : 'rgba(220,240,250,0.9)'
      const x = 24 + (i % 3) * 18
      ctx.fillRect(x, y, 60 + rnd() * 320, 6)
    }
  } else if (kind === 'graph') {
    ctx.strokeStyle = glow
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const x = 20 + i * 20
      const y = 250 - (60 + Math.abs(Math.sin(i * 0.7 + seed)) * 120)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 0.25
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = glow
      ctx.fillRect(24 + i * 40, 268, 22, 34 - (i % 5) * 5)
    }
    ctx.globalAlpha = 1
  } else if (kind === 'status') {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 3 === 0 ? glow : 'rgba(220,240,250,0.75)'
      ctx.globalAlpha = 0.8
      ctx.fillRect(26, 58 + i * 30, 140 + rnd() * 120, 10)
      ctx.globalAlpha = 0.35
      ctx.fillRect(300, 58 + i * 30, 180 * rnd(), 10)
      ctx.globalAlpha = 1
    }
  } else {
    ctx.font = FONT(18, '500')
    ctx.fillStyle = 'rgba(210,236,246,0.85)'
    for (let i = 0; i < 12; i++) {
      ctx.globalAlpha = 0.4 + rnd() * 0.6
      ctx.fillText(
        `> ${['build', 'test', 'commit', 'deploy', 'lint', 'review'][i % 6]}_${Math.floor(rnd() * 999)} ok`,
        22,
        56 + i * 22,
      )
    }
    ctx.globalAlpha = 1
  }
  return toTexture(canvas)
}

/** Transparent hologram panel: wireframe world + bars. */
export function holoTexture(accent: number, title: string) {
  const W = 768
  const H = 480
  const { canvas, ctx } = makeCanvas(W, H)
  const glow = hex(accent)
  ctx.clearRect(0, 0, W, H)
  ctx.strokeStyle = glow
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 3
  roundRect(ctx, 14, 14, W - 28, H - 28, 18)
  ctx.stroke()

  ctx.globalAlpha = 0.35
  ctx.lineWidth = 2
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.ellipse(W * 0.32, H * 0.52, 60 + i * 26, (60 + i * 26) * 0.42, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.85
  ctx.font = FONT(40, 'bold')
  ctx.fillStyle = glow
  ctx.fillText(title.toUpperCase(), 40, 74)

  ctx.globalAlpha = 0.6
  for (let i = 0; i < 6; i++) {
    const y = 170 + i * 42
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(W * 0.52, y, 200, 12)
    ctx.fillStyle = glow
    ctx.fillRect(W * 0.52, y, 40 + i * 26, 12)
  }
  ctx.globalAlpha = 1
  return toTexture(canvas)
}

/** A completed-mission plaque. */
export function plaqueTexture(title: string, accent = 0x46c47c, done = true) {
  const W = 768
  const H = 320
  const { canvas, ctx } = makeCanvas(W, H)
  ctx.fillStyle = '#f3efe6'
  roundRect(ctx, 0, 0, W, H, 22)
  ctx.fill()
  ctx.strokeStyle = hex(accent)
  ctx.lineWidth = 8
  roundRect(ctx, 10, 10, W - 20, H - 20, 16)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(104, H / 2, 52, 0, Math.PI * 2)
  ctx.fillStyle = hex(accent)
  ctx.globalAlpha = done ? 0.18 : 0.08
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = hex(accent)
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(76, H / 2 + 4)
  ctx.lineTo(98, H / 2 + 26)
  ctx.lineTo(136, H / 2 - 24)
  ctx.stroke()

  ctx.fillStyle = '#33373b'
  ctx.font = FONT(64, 'bold')
  ctx.textBaseline = 'middle'
  ctx.fillText(title.toUpperCase(), 186, H / 2 - 18)
  ctx.fillStyle = 'rgba(51,55,59,0.55)'
  ctx.font = FONT(34, '600')
  ctx.fillText('MISSION ARCHIVED', 188, H / 2 + 44)
  return toTexture(canvas)
}

export type RoleIcon = 'gear' | 'code' | 'check' | 'flask' | 'triangle' | 'none'

/** The role badge carried on a worker robot's side panel. */
export function roleIconTexture(kind: RoleIcon, color = 0x3a3e42) {
  const S = 256
  const { canvas, ctx } = makeCanvas(S, S)
  ctx.clearRect(0, 0, S, S)
  ctx.strokeStyle = hex(color)
  ctx.fillStyle = hex(color)
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const c = S / 2

  if (kind === 'gear') {
    ctx.save()
    ctx.translate(c, c)
    ctx.beginPath()
    ctx.arc(0, 0, 44, 0, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < 8; i++) {
      ctx.save()
      ctx.rotate((i / 8) * Math.PI * 2)
      ctx.beginPath()
      ctx.moveTo(0, -62)
      ctx.lineTo(0, -92)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  } else if (kind === 'code') {
    ctx.beginPath()
    ctx.moveTo(96, 74)
    ctx.lineTo(46, 128)
    ctx.lineTo(96, 182)
    ctx.moveTo(160, 74)
    ctx.lineTo(210, 128)
    ctx.lineTo(160, 182)
    ctx.stroke()
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(142, 62)
    ctx.lineTo(114, 194)
    ctx.stroke()
  } else if (kind === 'check') {
    ctx.lineWidth = 24
    ctx.beginPath()
    ctx.moveTo(66, 132)
    ctx.lineTo(112, 178)
    ctx.lineTo(194, 80)
    ctx.stroke()
  } else if (kind === 'flask') {
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.moveTo(104, 52)
    ctx.lineTo(104, 108)
    ctx.lineTo(64, 196)
    ctx.quadraticCurveTo(128, 216, 192, 196)
    ctx.lineTo(152, 108)
    ctx.lineTo(152, 52)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(92, 52)
    ctx.lineTo(164, 52)
    ctx.stroke()
  } else {
    // `triangle` (and the `none` default): the sheet's recessed-hatch glyph "▷"
    ctx.lineWidth = 20
    ctx.beginPath()
    ctx.moveTo(96, 62)
    ctx.lineTo(96, 194)
    ctx.lineTo(196, 128)
    ctx.closePath()
    ctx.stroke()
  }
  return toTexture(canvas)
}

/** Star field for the space backdrop. */
export function starfieldTexture() {
  const S = 2048
  const { canvas, ctx } = makeCanvas(S, S)
  ctx.fillStyle = '#04060b'
  ctx.fillRect(0, 0, S, S)
  // faint nebula wash
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 120 + Math.random() * 420
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const hue = [190, 215, 265, 30][i % 4]
    g.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.10)`)
    g.addColorStop(1, 'hsla(0,0%,0%,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = Math.random() < 0.94 ? Math.random() * 1.4 : 1.6 + Math.random() * 2.2
    ctx.fillStyle = `rgba(${220 + Math.random() * 35},${230 + Math.random() * 25},255,${
      0.35 + Math.random() * 0.65
    })`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return toTexture(canvas)
}

/** Earth-like planet face for the command deck windows. */
export function planetTexture(earthLike = true) {
  const S = 1024
  const { canvas, ctx } = makeCanvas(S, S)
  if (earthLike) {
    const g = ctx.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#7fb6dd')
    g.addColorStop(0.45, '#2f6ea8')
    g.addColorStop(1, '#123a63')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    ctx.fillStyle = 'rgba(122,150,96,0.95)'
    for (let i = 0; i < 42; i++) {
      const x = Math.random() * S
      const y = 120 + Math.random() * (S - 240)
      const w = 40 + Math.random() * 190
      const h = 26 + Math.random() * 120
      ctx.beginPath()
      ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(0, 0, S, 46)
    ctx.fillRect(0, S - 46, S, 46)
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.4
      ctx.beginPath()
      ctx.ellipse(Math.random() * S, Math.random() * S, 60 + Math.random() * 160, 16 + Math.random() * 40, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#e8c9a0')
    g.addColorStop(0.5, '#c78f5f')
    g.addColorStop(1, '#7d5233')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.12 + Math.random() * 0.3
      ctx.fillStyle = i % 2 ? '#f6e2c6' : '#8c5a35'
      ctx.beginPath()
      ctx.ellipse(Math.random() * S, Math.random() * S, 40 + Math.random() * 200, 20 + Math.random() * 90, Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  return toTexture(canvas)
}
