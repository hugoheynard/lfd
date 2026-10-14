/**
 * **« Une tournée de cette journée est-elle chargée ou partie ? »** — port
 * étroit que le fournil DÉCLARE et que la livraison IMPLÉMENTE (réouverture
 * d'une journée, Hugo, 2026-10-14).
 *
 * Chargée = un bac de la journée porte un chargement ; partie = une tournée
 * de la journée a un départ. La réouverture retirerait des arrêts d'une
 * tournée que le livreur a déjà en main : elle est refusée.
 */
export abstract class DayDispatchProgressReader {
  abstract startedOn(serviceDay: string): Promise<boolean>;
}
