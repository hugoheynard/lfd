import type { CardRefundRequest } from "../entities/card-refund-request.js";

/**
 * **Le port d'écriture des demandes de remboursement** (plan M2, §3.4) : il
 * prend et rend l'agrégat. Deux écrivains, deux conditions :
 *
 * - l'exécuteur, sous BAIL, par {@link save} — conditionnée par la génération
 *   et le jeton chargés ;
 * - le constat, SANS bail, par {@link transition} — conditionnée par l'état
 *   et la génération chargés.
 *
 * À appeler dans une unité de travail, APRÈS `lockSubject` puis le verrou du
 * paiement (§3.6) : l'ordre unique de toute écriture sur l'argent d'un sujet.
 */
export abstract class CardRefundRequestRepository {
  /**
   * Le paiement d'une demande, **sans verrou** — lu AVANT `lockSubject`, pour
   * savoir quel sujet verrouiller (§3.6). Sans risque : `payment_id` est
   * immuable (déclencheur `refund_request_guard`).
   */
  abstract paymentOf(requestId: string): Promise<string | null>;

  /** La demande, **sous verrou** de sa ligne quand une transaction est ouverte. */
  abstract load(requestId: string): Promise<CardRefundRequest | null>;

  /** Les demandes d'un paiement, de la plus ancienne à la plus récente. */
  abstract ofPayment(paymentId: string): Promise<readonly CardRefundRequest[]>;

  /**
   * Insère une demande neuve, ou réécrit une demande chargée **à condition**
   * que sa génération et son jeton de bail n'aient pas bougé depuis.
   *
   * @throws {CardRefundRequestConflictError} l'écriture conditionnée n'a pas franchi.
   */
  abstract save(request: CardRefundRequest): Promise<void>;

  /**
   * Écrit le changement d'état d'une demande chargée, **à condition** que son
   * état et sa génération n'aient pas bougé — sans toucher au bail. Rend
   * `false` quand la condition n'a pas franchi : l'issue était périmée.
   */
  abstract transition(request: CardRefundRequest): Promise<boolean>;
}
