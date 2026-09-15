import { Engine } from './core/engine'
import { Input } from './core/input'
import { bus } from './core/events'
import * as THREE from 'three'
import { buildShip } from './world/ship'
import { Player } from './game/player'
import { Simulation } from './game/system'
import { Hud } from './game/hud'
import { planFromText, MISSIONS } from './game/missions'
import { load, save } from './game/persistence'
import { ROLE_LABEL } from './game/state'
import type { Agent } from './entities/agent'

/**
 * TEAM MATE — the developer's spaceship.
 *
 * One connected world, one gameplay loop: the developer gives a mission, Team
 * Mate opens a project module and builds the agents, the robots physically
 * travel the ship and work at their stations, and the ship's state changes with
 * them. Nothing here is a dashboard — the world is the interface.
 */

const canvas = document.getElementById('scene') as HTMLCanvasElement
const boot = document.getElementById('boot') as HTMLElement
const bootBar = document.getElementById('boot-bar') as HTMLElement
const bootStage = document.getElementById('boot-stage') as HTMLElement
const bootGo = document.getElementById('boot-go') as HTMLButtonElement

const engine = new Engine(canvas)
const input = new Input(canvas)
const hud = new Hud()

let ship: ReturnType<typeof buildShip>
let player: Player
let sim: Simulation

const stage = (text: string, progress: number) => {
  bootStage.textContent = text
  bootBar.style.width = `${Math.round(progress * 100)}%`
}

function build() {
  stage('laying the keel', 0.08)
  ship = buildShip()
  engine.scene.add(ship.root)

  stage('routing power and corridors', 0.62)

  player = new Player(engine.camera)
  player.setPosition(-9, 210, 0.5, Math.PI + 0.5)
  engine.scene.add(player.root)

  stage('waking team mate', 0.85)

  sim = new Simulation(ship, engine.scene, {
    onReport: (text, kind) => hud.report(text, kind),
  })

  // The three installed modules sit dormant until a project claims them.
  for (const id of ['project-1', 'project-2', 'project-3']) ship.setRoomPower(id, false)

  // Bring back a previous run, if there is one. A bad payload is ignored.
  const saved = load()
  if (saved) sim.restore(saved)

  stage('ready', 1)
  bootGo.disabled = false
  bootGo.textContent = 'BOARD THE SHIP'
}

// Let the loading screen paint before the (synchronous) ship build.
bootGo.textContent = 'BUILDING…'
requestAnimationFrame(() => requestAnimationFrame(build))

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

let nearTeamMate = false

/** Plainer activity words for the inspection strip. */
const FOCUS_STATUS: Record<string, string> = {
  created: 'ASSEMBLING ON THE LAUNCH PAD',
  traveling: 'IN TRANSIT',
  working: 'WORKING AT THE STATION',
  reviewing: 'IN REVIEW',
  returning: 'STANDING BY',
  idle: 'IDLE — AWAITING ORDERS',
  done: 'MISSION COMPLETE',
}

function nearestAgent(): Agent | null {
  let best: Agent | null = null
  let bestD = Infinity
  const consider = (a: Agent) => {
    const d = Math.hypot(a.x - player.x, a.z - player.z)
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  for (const a of sim.agents.values()) consider(a)
  consider(sim.teamMate)
  return best
}

function toggleFocus() {
  if (player.focused) {
    player.releaseFocus()
    return
  }
  const agent = nearestAgent()
  if (agent) player.focusAgent(agent)
}

function updateInteraction() {
  const tm = sim.teamMatePosition()
  const d = Math.hypot(tm.x - player.x, tm.z - player.z)
  nearTeamMate = d < 9.5
  if (hud.terminalOpen) return
  if (player.focused) {
    hud.setPrompt(null)
    return
  }
  if (nearTeamMate) {
    hud.setPrompt(
      sim.projects.size > 0 && sim.roster().backend !== undefined
        ? 'Talk to Team Mate — give a new instruction'
        : 'Talk to Team Mate',
    )
  } else {
    hud.setPrompt(null)
  }
}

function openConsole() {
  input.uiCaptured = true
  input.releaseLock()
  hud.open((text) => {
    const known = MISSIONS.find((m) => text.toUpperCase().startsWith(m.name))
    sim.createProject(known ?? planFromText(text))
    player.nudge(0.06)
  })
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

let hudTick = 0
let saveTick = 0

engine.onUpdate((dt) => {
  if (!ship) return
  // --- input ---------------------------------------------------------------
  if (!hud.terminalOpen) {
    // release keyboard capture as soon as the console is no longer open
    input.uiCaptured = false
    if (input.pressed('KeyE') && nearTeamMate) openConsole()
    if (input.pressed('KeyF')) toggleFocus()
    if (input.pressed('Escape') && player.focused) player.releaseFocus()
    if (input.pressed('KeyC') && !player.focused) hud.report(`camera: ${player.cycleCamera()}`, 'info')
    if (input.pressed('KeyB')) engine.setBloom(!engine.bloomEnabled)
    if (input.pressed('Digit1')) sim.timeScale = 1
    if (input.pressed('Digit2')) sim.timeScale = 3
    if (input.pressed('Digit3')) sim.timeScale = 8
    if (input.pressed('KeyP')) sim.paused = !sim.paused
  }

  // --- world ---------------------------------------------------------------
  player.update(dt, input, ship)
  sim.update(dt)

  const visitors: { x: number; z: number; r: number }[] = [{ x: player.x, z: player.z, r: 1.6 }]
  for (const a of sim.agents.values()) visitors.push({ x: a.x, z: a.z, r: 1.1 })
  const tm = sim.teamMatePosition()
  visitors.push({ x: tm.x, z: tm.z, r: 1.1 })
  const occupied: { x: number; z: number }[] = []
  for (const a of ship.nav.anchors.values()) if (a.busy) occupied.push({ x: a.x, z: a.z })
  ship.update(dt, visitors, occupied)

  engine.followShadow(player.x, player.z)
  updateInteraction()

  // --- robot inspection ----------------------------------------------------
  if (player.focused && player.focusTarget) {
    const a = player.focusTarget
    const rec = sim.records.get(a.id)
    const project = rec ? sim.projects.get(rec.projectId) : undefined
    const task = project?.tasks.find((t) => t.id === rec?.taskId)
    const busy = a.state === 'working' || a.state === 'reporting'
    hud.setFocus({
      name: a.name,
      role: rec ? ROLE_LABEL[rec.role] : 'ORCHESTRATOR',
      task: task?.title ?? (rec ? FOCUS_STATUS[rec.status] ?? rec.status.toUpperCase() : 'ORCHESTRATING'),
      project: project?.name ?? '—',
      progress: busy ? a.workProgress() : 0,
    })
  } else {
    hud.setFocus(null)
  }

  // --- persistence ---------------------------------------------------------
  saveTick += dt
  if (saveTick > 2) {
    saveTick = 0
    save(sim.snapshot())
  }

  // --- hud -----------------------------------------------------------------
  hudTick += dt
  if (hudTick > 0.4) {
    hudTick = 0
    const active = [...sim.projects.values()].filter((p) => p.status === 'active').length
    hud.setStatus(
      `DECK 06 · COMMAND<br>` +
        `<b>${active}</b> ACTIVE MISSION${active === 1 ? '' : 'S'}<br>` +
        `<b>${sim.agents.size}</b> AGENTS DEPLOYED<br>` +
        `<b>${sim.completed.length}</b> ARCHIVED<br>` +
        `TIME ${sim.timeScale}×${sim.paused ? ' · PAUSED' : ''}`,
    )
  }

  input.endFrame()
})

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

let started = false
function enterWorld() {
  if (started || !ship) return
  started = true
  boot.classList.add('gone')
  input.requestLock()
  hud.fadeHint()
  window.setTimeout(() => boot.remove(), 700)
  window.setTimeout(
    () => hud.report('Systems nominal. I am ready for your instruction, commander.', 'info'),
    2200,
  )
}

bootGo.addEventListener('click', enterWorld)
canvas.addEventListener('click', () => {
  if (started && !hud.terminalOpen) input.requestLock()
})

bus.on('project:completed', () => player?.nudge(0.05))

window.addEventListener('beforeunload', () => {
  if (sim) save(sim.snapshot())
})

engine.start()

// expose for tinkering from the console
;(window as unknown as Record<string, unknown>).teamMate = {
  THREE,
  engine,
  get ship() {
    return ship
  },
  get sim() {
    return sim
  },
  get player() {
    return player
  },
  hud,
  enterWorld,
}
