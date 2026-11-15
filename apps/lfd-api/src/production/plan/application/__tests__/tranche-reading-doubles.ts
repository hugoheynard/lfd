import type { TrancheThreshold } from "../../../day/index.js";

/**
 * Les tranches de la fiche d'atelier, doublées : celles qu'on pose, ou
 * `null` — la lecture en panne, le dossier part sans calendrier.
 */
export class FixedTrancheReading {
  constructor(
    private readonly tranches: ReadonlyMap<string, readonly TrancheThreshold[]> | null = new Map(),
  ) {}

  read(): Promise<ReadonlyMap<string, readonly TrancheThreshold[]> | null> {
    return Promise.resolve(this.tranches);
  }
}
