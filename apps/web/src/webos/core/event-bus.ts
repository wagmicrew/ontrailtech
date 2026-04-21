type Handler = (payload: unknown) => void;

class LocalEventBus {
  private listeners = new Map<string, Set<Handler>>();

  emit(event: string, payload: unknown = null) {
    this.listeners.get(event)?.forEach(h => {
      try { h(payload); } catch {}
    });
    this.listeners.get('*')?.forEach(h => {
      try { h({ event, payload }); } catch {}
    });
  }

  subscribe(event: string, handler: Handler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  once(event: string, handler: Handler) {
    const unsub = this.subscribe(event, (payload) => {
      handler(payload);
      unsub();
    });
  }
}

export const eventBus = new LocalEventBus();
