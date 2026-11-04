/**
 * **Le minuteur de la fenêtre de purge** — un port pour que le regroupement
 * se teste sans attendre une seconde réelle.
 */
export abstract class ShelfWindowTimer {
  /** Appelle `callback` une fois, après `delayMs` millisecondes. */
  abstract after(delayMs: number, callback: () => void): void;
}
