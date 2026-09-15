/**
 * The bridge between game state and world state.
 *
 * Every meaningful change in the simulation is announced here, and the world
 * reacts physically: a module lights up, a robot undocks, a room goes red, a
 * plaque materializes. Nothing is bound directly to a UI widget.
 */
export type GameEvent =
  | { type: 'project:created'; projectId: string; moduleId: string }
  | { type: 'project:progress'; projectId: string; progress: number }
  | { type: 'project:completed'; projectId: string }
  | { type: 'agent:created'; agentId: string; role: string }
  | { type: 'agent:assigned'; agentId: string; projectId: string }
  | { type: 'agent:departed'; agentId: string; projectId: string }
  | { type: 'agent:working'; agentId: string; projectId: string }
  | { type: 'agent:review'; agentId: string; projectId: string }
  | { type: 'agent:error'; agentId: string; projectId: string }
  | { type: 'agent:returning'; agentId: string }
  | { type: 'agent:completed'; agentId: string }
  | { type: 'task:completed'; projectId: string; taskId: string }
  | { type: 'ship:warning'; on: boolean }
  | { type: 'report'; text: string; kind: 'info' | 'success' | 'warn' }

type Handler = (e: GameEvent) => void

class EventBus {
  private handlers = new Map<string, Set<Handler>>()

  on<T extends GameEvent['type']>(type: T, fn: (e: Extract<GameEvent, { type: T }>) => void) {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(fn as Handler)
    return () => set!.delete(fn as Handler)
  }

  emit(e: GameEvent) {
    const set = this.handlers.get(e.type)
    if (!set) return
    for (const fn of set) fn(e)
  }
}

export const bus = new EventBus()
