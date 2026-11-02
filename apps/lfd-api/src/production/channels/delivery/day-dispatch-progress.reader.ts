/**
 * **« Une tournée de cette journée est-elle chargée ou partie ? »** — port
 * étroit que le fournil DÉCLARE et que la livraison IMPLÉMENTE (réouverture
 * d'une journée, Hugo, 2026-10-14).
 *
 * Chargée = un bac de la journée porte un chargement ; partie = une tournée
 * de la journée a un départ. La réouverture retirerait des arrêts d'une
 * tournée que le livreur a déjà en main : elle est refusée.
 *
 * Appelé SOUS le verrou exclusif de la journée (2026-11-02), dans la
 * transaction de la réouverture : l'implémentation ne lit qu'en `SELECT`
 * simple, sans prendre de verrou chez elle — sans quoi elle pourrait attendre
 * un geste qui attend lui-même le verrou de la journée (`ArrestedPlanHold`).
 */
export abstract class DayDispatchProgressReader {
  abstract startedOn(serviceDay: string): Promise<boolean>;
}
