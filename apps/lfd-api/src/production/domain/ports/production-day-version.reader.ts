import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Lire la version d'une journée** dans le journal du fournil
 * (`documentation/caching-usage/plan-version-par-journee.md`, D2).
 *
 * Un port à part du balayage (ISP) : l'écran qui veille ne purge rien, et le
 * balayage ne lit aucune version.
 */
export abstract class ProductionDayVersionReader {
  /**
   * Le plus grand identifiant du journal pour cette journée, `0` si aucun.
   * Opaque : il se compare par égalité, il ne compte rien.
   */
  abstract versionOf(day: ServiceDay): Promise<number>;
}
