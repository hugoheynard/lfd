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
}
