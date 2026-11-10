import type { SaleUnit } from "@lfd/money";

/** Une ligne de la décision prise : le dû au signal, et ce qui a été décidé de faire partir. */
export interface DecidedShortfallLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  readonly due: number;
  readonly departing: number;
}

/** La décision d'un envoi, telle que le comptoir la montre : qui, quand, et quoi. */
export interface DecidedShortfall {
  readonly decidedAt: Date;
  /** La référence staff écrite par la décision — l'id de la fiche ; nommée par l'annuaire. */
  readonly decidedBy: string;
  readonly lines: readonly DecidedShortfallLine[];
}

/**
 * **Le départ incomplet déjà tranché, lu pour le comptoir** (Hugo,
 * 2026-11-03) : quand l'aperçu refuse `already_decided` ou
 * `already_authorized`, l'écran offre « Remettre la commande » avec
 * « Départ incomplet validé par <Nom> à <heure> », et montre ce qui part.
 *
 * Un port à part (ISP) : `ShortfallDecisionReader` rend la décision comme
 * entrée du BL (quantités et règles d'argent), sans auteur ni noms ; la fiche
 * commande lit `OrderShortfallReader`, sans auteur non plus.
 */
export abstract class CounterShortfallDecisionReader {
  /** La décision de l'envoi `(commande, rang)`, ou `null` s'il n'en a pas. */
  abstract decisionOf(orderId: string, rank: number): Promise<DecidedShortfall | null>;
}
