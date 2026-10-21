/**
 * **Les réglages du fournil, en lecture** — un port à part du dépôt des jours
 * fermés (ISP) : la page Réglages lit, elle ne juge rien.
 *
 * Il rendait aussi le mode et les heures d'arrêt jusqu'au 2026-10-21 : l'arrêt
 * suit désormais l'heure limite générale, lue au commerce par
 * `OrderCutoffRulesReader` (`limites-de-commande/plan-une-seule-heure.md` §5).
 * La ligne `production.production_settings` reste en base, plus personne ne la lit.
 */
export abstract class ProductionSettingsReader {
  /** Les jours fermés de `from` (compris) à plus tard, dans l'ordre. */
  abstract closedDaysFrom(from: string): Promise<readonly string[]>;
}
