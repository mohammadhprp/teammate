import { MISSIONS, planFromText } from './missions'

/**
 * Minimal, diegetic UI.
 *
 * There is no dashboard here: the ship is the interface. The HUD only carries
 * what cannot live in the world — an interaction prompt, Team Mate's comms
 * ticker, and Team Mate's own mission console for typing an instruction.
 */

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #eaf4f8; }
#hud .fade { transition: opacity .35s ease; }

#prompt { position: absolute; left: 50%; bottom: 8.5vh; transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-radius: 999px;
  background: rgba(12,18,24,.72); border: 1px solid rgba(95,216,240,.35);
  box-shadow: 0 8px 30px rgba(0,0,0,.45); backdrop-filter: blur(8px);
  letter-spacing: .14em; font-size: 13px; font-weight: 600; opacity: 0; }
#prompt.on { opacity: 1; }
#prompt kbd { display: inline-block; min-width: 26px; text-align: center;
  background: #5fd8f0; color: #0b1116; border-radius: 6px; padding: 3px 7px; font-size: 12px; font-weight: 800; }

#ticker { position: absolute; left: 26px; bottom: 24px; max-width: 46vw; display: flex;
  flex-direction: column; gap: 5px; }
#ticker div { font-size: 12.5px; letter-spacing: .04em; line-height: 1.45;
  text-shadow: 0 1px 6px rgba(0,0,0,.85); opacity: .95;
  background: linear-gradient(90deg, rgba(8,12,16,.55), rgba(8,12,16,0));
  padding: 3px 10px 3px 0; border-left: 2px solid rgba(95,216,240,.55); padding-left: 10px; }
#ticker div.warn { border-color: #ef5a45; color: #ffd9d2; }
#ticker div.success { border-color: #46c47c; color: #d6ffe6; }

#status { position: absolute; right: 26px; top: 22px; text-align: right; font-size: 11.5px;
  letter-spacing: .16em; opacity: .8; line-height: 1.7; }
#status b { color: #5fd8f0; font-weight: 700; }

#hint { position: absolute; left: 26px; top: 22px; font-size: 11.5px; letter-spacing: .13em;
  opacity: .62; line-height: 1.9; }
#hint b { color: #5fd8f0; }

#focus { position: absolute; left: 50%; bottom: 8.5vh; transform: translateX(-50%);
  min-width: 360px; max-width: 60vw; padding: 12px 20px 10px; border-radius: 14px;
  background: rgba(12,18,24,.78); border: 1px solid rgba(95,216,240,.4);
  box-shadow: 0 8px 30px rgba(0,0,0,.5); backdrop-filter: blur(8px);
  letter-spacing: .1em; font-size: 12px; opacity: 0; visibility: hidden;
  transition: opacity .18s ease; }
#focus.on { opacity: 1; visibility: visible; }
#focus .name { font-size: 14px; font-weight: 800; letter-spacing: .18em; color: #eaf4f8; }
#focus .name i { font-style: normal; color: #5fd8f0; margin-left: 10px; font-size: 11px; letter-spacing: .14em; }
#focus .row { display: flex; justify-content: space-between; gap: 24px; line-height: 1.75; }
#focus .row span { opacity: .62; letter-spacing: .16em; font-size: 10.5px; }
#focus .row b { font-weight: 600; letter-spacing: .05em; text-align: right; }
#focus .hintline { margin-top: 7px; padding-top: 7px; border-top: 1px solid rgba(95,216,240,.16);
  opacity: .5; font-size: 10.5px; letter-spacing: .16em; }

#terminal { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.96);
  width: min(720px, 88vw); pointer-events: auto; opacity: 0; visibility: hidden;
  background: linear-gradient(180deg, rgba(14,20,26,.96), rgba(10,14,18,.98));
  border: 1px solid rgba(95,216,240,.3); border-radius: 18px; overflow: hidden;
  box-shadow: 0 30px 90px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06);
  transition: opacity .22s ease, transform .22s ease; }
#terminal.on { opacity: 1; visibility: visible; transform: translate(-50%,-50%) scale(1); }
#terminal header { display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px; border-bottom: 1px solid rgba(95,216,240,.16); letter-spacing: .2em;
  font-size: 12px; font-weight: 700; color: #9fe4f6; }
#terminal header span.dot { width: 8px; height: 8px; border-radius: 50%; background: #5fd8f0;
  display: inline-block; margin-right: 10px; box-shadow: 0 0 12px #5fd8f0; }
#terminal .body { padding: 20px 22px 8px; }
#terminal p.lead { margin: 0 0 16px; font-size: 13.5px; line-height: 1.6; color: #b9cbd4; }
#terminal input { width: 100%; box-sizing: border-box; background: rgba(0,0,0,.45);
  border: 1px solid rgba(95,216,240,.28); border-radius: 12px; color: #eaf4f8;
  padding: 14px 16px; font-size: 15px; font-family: inherit; outline: none; }
#terminal input:focus { border-color: rgba(95,216,240,.7); box-shadow: 0 0 0 3px rgba(95,216,240,.12); }
#terminal .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0 6px; }
#terminal .quick button { pointer-events: auto; cursor: pointer; text-align: left; color: #eaf4f8;
  background: rgba(95,216,240,.07); border: 1px solid rgba(95,216,240,.22); border-radius: 12px;
  padding: 12px 14px; font-family: inherit; font-size: 12px; letter-spacing: .1em; line-height: 1.5; }
#terminal .quick button:hover { background: rgba(95,216,240,.16); border-color: rgba(95,216,240,.5); }
#terminal .quick button b { display: block; font-size: 13.5px; letter-spacing: .12em; margin-bottom: 4px; }
#terminal .quick button i { font-style: normal; opacity: .6; font-size: 11px; letter-spacing: .08em; }
#terminal footer { padding: 14px 22px 18px; font-size: 11.5px; letter-spacing: .13em; color: #7d919b; }
`

export interface MissionChoice {
  name: string
  subtitle: string
  summary: string
  text: string
}

/** Everything the robot-inspection strip shows. */
export interface FocusInfo {
  name: string
  role: string
  task: string
  project: string
  progress: number
}

export class Hud {
  private prompt: HTMLElement
  private ticker: HTMLElement
  private status: HTMLElement
  private hint: HTMLElement
  private terminal: HTMLElement
  private focus: HTMLElement
  private input: HTMLInputElement
  terminalOpen = false
  private onSubmit: ((text: string) => void) | null = null
  private hintTimer = 0
  private focusSig = ''

  constructor() {
    if (!document.getElementById('hud-style')) {
      const style = document.createElement('style')
      style.id = 'hud-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }
    const root = document.createElement('div')
    root.id = 'hud'
    root.innerHTML = `
      <div id="status"></div>
      <div id="hint">
        <div><b>W A S D</b> move &nbsp;·&nbsp; <b>MOUSE</b> look &nbsp;·&nbsp; <b>SHIFT</b> boost</div>
        <div><b>E</b> talk to Team Mate &nbsp;·&nbsp; <b>C</b> camera &nbsp;·&nbsp; <b>1 2 3</b> time</div>
        <div><b>F</b> inspect robot &nbsp;·&nbsp; <b>B</b> bloom &nbsp;·&nbsp; <b>ESC</b> release cursor</div>
      </div>
      <div id="prompt"><kbd>E</kbd><span id="prompt-text">Talk to Team Mate</span></div>
      <div id="focus"></div>
      <div id="ticker"></div>
      <div id="terminal">
        <header><span><span class="dot"></span>TEAM MATE · MISSION CONSOLE</span><span>DECK 06</span></header>
        <div class="body">
          <p class="lead">Give the instruction. Team Mate will open a project module, build the agents
          it needs, and put them to work in the ship.</p>
          <input id="terminal-input" placeholder="e.g. build the payments API, then review and test it" />
          <div class="quick" id="terminal-quick"></div>
        </div>
        <footer>ENTER dispatch &nbsp;·&nbsp; ESC close &nbsp;·&nbsp; or pick a standing mission above</footer>
      </div>
    `
    document.body.appendChild(root)
    this.prompt = root.querySelector('#prompt') as HTMLElement
    this.ticker = root.querySelector('#ticker') as HTMLElement
    this.status = root.querySelector('#status') as HTMLElement
    this.hint = root.querySelector('#hint') as HTMLElement
    this.terminal = root.querySelector('#terminal') as HTMLElement
    this.focus = root.querySelector('#focus') as HTMLElement
    this.input = root.querySelector('#terminal-input') as HTMLInputElement

    const quick = root.querySelector('#terminal-quick') as HTMLElement
    for (const m of MISSIONS) {
      const b = document.createElement('button')
      b.innerHTML = `<b>${m.name}</b>${m.subtitle}<br><i>${m.tasks.length} tasks · ${m.tasks
        .map((t) => t.role)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(' / ')}</i>`
      b.onclick = () => this.submit(m.name + ' — ' + m.summary)
      quick.appendChild(b)
    }

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit(this.input.value)
      if (e.key === 'Escape') this.close()
      e.stopPropagation()
    })
    window.addEventListener('keydown', (e) => {
      if (this.terminalOpen && e.key === 'Escape') this.close()
    })
  }

  setPrompt(text: string | null) {
    if (text) {
      ;(this.prompt.querySelector('#prompt-text') as HTMLElement).textContent = text
      this.prompt.classList.add('on')
    } else {
      this.prompt.classList.remove('on')
    }
  }

  setStatus(html: string) {
    this.status.innerHTML = html
  }

  /** The robot-inspection strip. Pass null to release it. */
  setFocus(info: FocusInfo | null) {
    if (!info) {
      if (!this.focusSig) return
      this.focusSig = ''
      this.focus.classList.remove('on')
      return
    }
    const sig = JSON.stringify(info)
    if (sig === this.focusSig) return
    this.focusSig = sig
    this.focus.classList.add('on')
    this.focus.innerHTML = `
      <div class="name">${escapeHtml(info.name)}<i>${escapeHtml(info.role)}</i></div>
      <div class="row"><span>PROJECT</span><b>${escapeHtml(info.project)}</b></div>
      <div class="row"><span>TASK</span><b>${escapeHtml(info.task)}</b></div>
      <div class="row"><span>PROGRESS</span><b>${Math.round(info.progress * 100)}%</b></div>
      <div class="hintline">F / ESC RELEASE · DRAG TO ORBIT · SCROLL TO ZOOM</div>`
  }

  report(text: string, kind: 'info' | 'success' | 'warn') {
    const line = document.createElement('div')
    line.className = kind
    line.textContent = `TEAM MATE — ${text}`
    this.ticker.appendChild(line)
    while (this.ticker.children.length > 4) this.ticker.removeChild(this.ticker.firstChild!)
    window.setTimeout(() => {
      line.style.opacity = '0'
      window.setTimeout(() => line.remove(), 400)
    }, 9000)
  }

  fadeHint() {
    this.hintTimer++
    if (this.hintTimer > 1) this.hint.classList.add('fade')
    if (this.hintTimer > 2) this.hint.style.opacity = '0'
    window.setTimeout(() => this.hint.classList.add('fade'), 26000)
  }

  open(onSubmit: (text: string) => void) {
    this.onSubmit = onSubmit
    this.terminalOpen = true
    this.terminal.classList.add('on')
    this.input.value = ''
    window.setTimeout(() => this.input.focus(), 40)
  }

  close() {
    this.terminalOpen = false
    this.terminal.classList.remove('on')
    this.input.blur()
  }

  private submit(text: string) {
    const clean = text.trim()
    if (!clean) return
    this.close()
    this.onSubmit?.(clean)
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export { planFromText, MISSIONS }
