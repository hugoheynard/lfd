import type { ProductionTrackingLevel } from "@lfd/contracts";

import { InvalidTrackingMarginError } from "../errors/tracking-errors.js";

/** La marge par défaut : un palier est réputé sorti un quart d'heure après son heure. */
const DEFAULT_MARGIN_MINUTES = 15;

/** Au plus quatre heures : au-delà, le palier suivant serait souvent échu avant lui. */
export const MAX_TRACKING_MARGIN_MINUTES = 240;

/** L'état tel qu'il se pose, se lit et se journalise. */
export interface ProductionTrackingSettingsState {
  readonly level: ProductionTrackingLevel;
  readonly marginMinutes: number;
}

/**
 * **Le niveau de suivi du fournil et sa marge** — Réglages › Niveau de suivi
 * (`documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Un réglage, pas un agrégat : il n'a ni transition ni règle qui dépende de
 * l'état précédent. La seule règle — une marge en minutes entières, bornée —
 * se juge sur la valeur seule, et la factory la refuse. Le niveau vaut à
 * partir de la prochaine journée arrêtée : une journée lit le niveau figé à
 * son premier passage, jamais ce réglage.
 */
export class ProductionTrackingSettings implements ProductionTrackingSettingsState {
  private constructor(
    readonly level: ProductionTrackingLevel,
    readonly marginMinutes: number,
  ) {}

  /** Personne n'a rien réglé : toujours vert, un quart d'heure de marge. */
  static defaults(): ProductionTrackingSettings {
    return new ProductionTrackingSettings("always_green", DEFAULT_MARGIN_MINUTES);
  }

  /** @throws {InvalidTrackingMarginError} pas des minutes entières, ou hors de 0 à 240. */
  static of(values: ProductionTrackingSettingsState): ProductionTrackingSettings {
    const minutes = values.marginMinutes;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_TRACKING_MARGIN_MINUTES) {
      throw new InvalidTrackingMarginError(minutes, MAX_TRACKING_MARGIN_MINUTES);
    }
    return new ProductionTrackingSettings(values.level, minutes);
  }

  equals(other: ProductionTrackingSettingsState): boolean {
    return this.level === other.level && this.marginMinutes === other.marginMinutes;
  }
}
