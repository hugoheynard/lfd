import { Injectable } from "@nestjs/common";

import { ShelfWindowTimer } from "../domain/ports/shelf-window-timer.js";

/**
 * Le minuteur réel. `unref` : une fenêtre en attente ne retient pas l'arrêt
 * du processus — la purge perdue est rattrapée par la durée de vie des rayons.
 */
@Injectable()
export class NodeShelfWindowTimer extends ShelfWindowTimer {
  after(delayMs: number, callback: () => void): void {
    setTimeout(callback, delayMs).unref();
  }
}
