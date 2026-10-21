import type { ResupplyReceipt } from "./resupply-receipt.js";

/**
 * Port d'**écriture** de la réception : l'agrégat entier, chargé puis rendu.
 * `save` refuse d'écraser une liste modifiée entre-temps
 * (`ResupplyReceiptChangedMeanwhileError`) : le verrou est la version lue.
 */
export abstract class ResupplyReceiptRepository {
  /** La réception de ce site ce jour-là, ou `null` si personne n'a rien saisi. */
  abstract load(siteId: string, serviceDay: string): Promise<ResupplyReceipt | null>;

  abstract save(receipt: ResupplyReceipt): Promise<void>;
}
