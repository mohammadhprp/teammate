/** Keyboard + pointer input. Pointer lock is used for the orbit camera. */
export class Input {
  private down = new Set<string>()
  private pressedThisFrame = new Set<string>()
  mouseDX = 0
  mouseDY = 0
  wheel = 0
  pointerLocked = false
  /** True while a DOM overlay (terminal) owns the keyboard. */
  uiCaptured = false

  private canvas: HTMLElement

  constructor(canvas: HTMLElement) {
    this.canvas = canvas
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onLockChange)
    canvas.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.uiCaptured) return
    if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code)
    this.down.add(e.code)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault()
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }

  private onBlur = () => {
    this.down.clear()
  }

  private onMouseDown = () => {
    if (!this.pointerLocked && !this.uiCaptured) this.requestLock()
  }

  private onMouseUp = () => {}

  requestLock() {
    this.canvas.requestPointerLock?.()
  }

  releaseLock() {
    document.exitPointerLock?.()
  }

  private onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }

  private onWheel = (e: WheelEvent) => {
    if (this.uiCaptured) return
    e.preventDefault()
    this.wheel += e.deltaY
  }

  isDown(code: string) {
    return this.down.has(code)
  }

  /** True only on the frame the key went down. */
  pressed(code: string) {
    return this.pressedThisFrame.has(code)
  }

  axis(neg: string, pos: string) {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0)
  }

  endFrame() {
    this.pressedThisFrame.clear()
    this.mouseDX = 0
    this.mouseDY = 0
    this.wheel = 0
  }
}
