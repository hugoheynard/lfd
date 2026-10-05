import type { VolumeWindow } from "./sku-volume.reader.js";

/**
 * Le volume commandé **par un client**, par SKU et par fenêtre.
 *
 * Distinct de {@link SkuVolumeReader}, qui mesure le marché entier pour
 * l'élasticité. Ici la question est « où en est CE client sur SON engagement »,
 * et confondre les deux ferait ouvrir un palier négocié sur les ventes des
 * autres.
 */
export abstract class CustomerVolumeReader {
  /**
   * Les quantités commandées par ce client sur la fenêtre.
   *
   * Un SKU sans commande est **absent** plutôt que présent à zéro : l'appelant
   * doit distinguer « rien commandé » de « pas demandé ».
   */
  abstract volumesFor(
    companyId: string,
    skus: readonly string[],
    window: VolumeWindow,
  ): Promise<ReadonlyMap<string, number>>;

  /**
   * Le volume qui compte pour **l'engagement** de ce compte : le sien, plus
   * les commandes des sous-comptes qui suivaient son tarif à la date de
   * chaque commande (Q6, R5 — `plan-sous-comptes.md`).
   *
   * Séparé de {@link volumesFor} parce que seul le palier agrège : côté
   * commercial, chaque sous-compte est vu seul (R9), et l'effort de vente
   * d'une fiche ne compte que la société.
   */
  abstract committedVolumesFor(
    companyId: string,
    skus: readonly string[],
    window: VolumeWindow,
  ): Promise<ReadonlyMap<string, number>>;
}
