/**
 * **La version d'une journée au colisage** — port que le fournil DÉCLARE et que
 * le colisage IMPLÉMENTE (plan `colisage/colisage.md`, K2, §10.3).
 *
 * Le poste du fournil relit sa journée quand le journal `production` de `GET admin/day-versions`
 * change. Sur une journée `packing`, les gestes du poste écrivent au colisage,
 * dont le journal (`packing.day_change`) est à part (D3 de
 * `caching-usage/version-par-journee.md`) : sans lui, l'écran ne verrait
 * plus bouger ni une ligne au bac, ni un container, ni une fermeture.
 *
 * `max(id)` du journal du colisage pour la journée ; `0` = aucune trace.
 */
export abstract class PackingDayVersionReader {
  abstract versionOf(serviceDay: string): Promise<number>;
}
