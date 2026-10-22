/**
 * **La couleur des commandes d'un transfert, au moment d'imprimer** — une
 * pastille par commande dans le bloc du transfert interne de la feuille de
 * tournée (plan `comptabilite/plan-planche-des-documents-v2.md`, §0 bis,
 * décisions de Hugo du 2026-10-22).
 *
 * Les commandes d'un transfert sont des RETRAITS au site d'arrivée : leur
 * couleur est celle de retrait de ce site, que la livraison ne connaît pas
 * (`DeliveryColorsReader` ne porte que les couleurs de livraison du départ,
 * vérifié le 2026-10-22). Déclaré par la livraison, implémenté par le
 * commerce avec la règle du bon, relié dans `appBootstrap`.
 */
export abstract class TransferOrderColorsReader {
  /** Par commande, sa couleur ; une commande sans couleur est ABSENTE. */
  abstract colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
