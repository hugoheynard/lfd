import type { SettlementSweepWindow } from "../services/settlement-sweep.js";

/** Une commande dont le règlement n'est pas encaissé, et son intention s'il y en a une. */
export interface UnsettledSettlement {
  readonly orderId: string;
  readonly paymentIntentId: string | null;
}

/**
 * Port de **lecture** du balayage de clôture : les commandes encore `placed`
 * d'une journée dont le règlement n'est PAS encaissé — en attente **ou**
 * refusé (§9 bis, B2 : une carte refusée garde une intention vivante, qui peut
 * encore passer). Étroit par construction (ISP) : le balayage ne lit rien
 * d'autre.
 */
export abstract class UnsettledSettlementReader {
  abstract unsettledOn(window: SettlementSweepWindow): Promise<readonly UnsettledSettlement[]>;
}
