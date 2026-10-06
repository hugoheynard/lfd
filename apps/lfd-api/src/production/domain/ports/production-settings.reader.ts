import type { CloseSettingsValues } from "../entities/production-close-settings.js";

/**
 * **Les réglages du fournil, en lecture** — un port à part des deux dépôts
 * (ISP) : la page Réglages lit, elle ne juge rien.
 */
export abstract class ProductionSettingsReader {
  /** `null` : personne n'a encore réglé. */
  abstract closeSettings(): Promise<CloseSettingsValues | null>;

  /** Les jours fermés de `from` (compris) à plus tard, dans l'ordre. */
  abstract closedDaysFrom(from: string): Promise<readonly string[]>;
}
