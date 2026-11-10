import type { ResupplyReceipt } from "./resupply-receipt.js";

/**
 * Port d'**écriture** du reçu : l'agrégat entier, chargé puis rendu. Le point
 * est dans chaque clé — le mur par point. `save` refuse d'écraser un reçu
 * modifié entre-temps (`ResupplyReceiptChangedMeanwhileError`), et un second
 * reçu pour un même réassort (`ResupplyAlreadyReceivedError`).
 */
export abstract class ResupplyReceiptRepository {
  /** Le réassort sans commande de ce point ce jour-là, ou `null` si personne n'a rien saisi. */
  abstract loadUnordered(siteId: string, serviceDay: string): Promise<ResupplyReceipt | null>;

  /** Le reçu de ce réassort au point, ou `null` s'il n'est pas encore réceptionné. */
  abstract loadForResupply(siteId: string, resupplyId: string): Promise<ResupplyReceipt | null>;

  abstract save(receipt: ResupplyReceipt): Promise<void>;
}
