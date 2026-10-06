import type { DeclaredStopBin } from "../services/stop-demand.js";

/** Un bac déclaré, non annulé, et la commande qui le porte. */
export interface DeclaredBinRow extends DeclaredStopBin {
  readonly orderId: string;
}

/**
 * Port de **lecture** des bacs déclarés de plusieurs commandes à la fois
 * (CA4) — ce que « Proposer » lit pour juger la place. Distinct de
 * `DeliveryLoadingReader` (ISP) : ni code, ni partenaire, ni chargement ;
 * seulement de quoi poser les bacs dans une caisse.
 */
export abstract class DeclaredBinsReader {
  /** Les bacs NON annulés de ces commandes, dans l'ordre de déclaration. */
  abstract liveAmong(orderIds: readonly string[]): Promise<readonly DeclaredBinRow[]>;
}
