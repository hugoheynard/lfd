/**
 * **La couleur d'une commande, pour l'étiquette de ses bacs** (2026-10-25) —
 * le carré que la page d'étiquettes peignait à l'écran depuis la palette des
 * sites, et que le serveur imprime désormais lui-même.
 *
 * La règle est celle du bon de commande (retrait : la couleur de son site ;
 * livraison : celle du site de départ, par clientèle), que la livraison ne
 * tient pas : DÉCLARÉ ici, IMPLÉMENTÉ par le commerce, relié dans
 * `appBootstrap`. Distinct de `TransferOrderColorsReader`, qui sert la feuille
 * de tournée : deux lecteurs, deux raisons de changer.
 */
export abstract class BinLabelColorsReader {
  /** `#rrggbb`, ou `null` : commande inconnue ou couleur non posée — aucun carré. */
  abstract colorOf(orderId: string): Promise<string | null>;
}
