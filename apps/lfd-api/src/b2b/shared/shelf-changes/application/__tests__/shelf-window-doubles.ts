import { ShelfPurge, type ShelfPurgeRequest } from "../../domain/ports/shelf-purge.js";
import { ShelfWindowTimer } from "../../domain/ports/shelf-window-timer.js";

/** Un minuteur tenu à la main : la fenêtre ne se ferme que sur `fire()`. */
export class ManualShelfWindowTimer extends ShelfWindowTimer {
  readonly delays: number[] = [];
  private readonly pending: (() => void)[] = [];

  after(delayMs: number, callback: () => void): void {
    this.delays.push(delayMs);
    this.pending.push(callback);
  }

  /** Ferme les fenêtres échues, puis laisse partir la purge asynchrone. */
  async fire(): Promise<void> {
    for (const callback of this.pending.splice(0)) {
      callback();
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Une purge enregistrée, ou qui échoue sur demande. */
export class RecordingShelfPurge extends ShelfPurge {
  readonly requests: ShelfPurgeRequest[] = [];
  failing = false;

  purge(request: ShelfPurgeRequest): Promise<void> {
    if (this.failing) {
      return Promise.reject(new RangeError("magasin des rayons injoignable"));
    }
    this.requests.push(request);
    return Promise.resolve();
  }
}
