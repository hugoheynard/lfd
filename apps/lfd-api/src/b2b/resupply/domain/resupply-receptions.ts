import type { SiteResupplyTrace } from "./site-resupply.js";

/**
 * Port de **lecture** de la réception d'un réassort (lot R1d) : l'annulation
 * la lit pour refuser d'annuler ce qui est déjà arrivé. Distinct du port
 * d'écriture du reçu (ISP) : l'annulation ne touche pas au reçu.
 */
export abstract class ResupplyReceptions {
  /**
   * « Réceptionner » de ce réassort au point (instant et auteur figés), ou
   * `null` s'il n'est pas réceptionné. Le point est dans la clé : le mur.
   */
  abstract receptionOf(siteId: string, resupplyId: string): Promise<SiteResupplyTrace | null>;
}
