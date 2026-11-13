/**
 * Un remboursement de la commande, tel que le bloc `card-payment` le rend —
 * réduit à ce que la règle lit.
 */
export interface RefundPartShape {
  readonly refundId: string;
  /** La demande qui l'a émis ; `null` : fait hors de la plateforme. */
  readonly requestId: string | null;
  /** `provider` : rendu par le prestataire ; `manual` : « Réglé autrement ». */
  readonly source: string;
  readonly status: string;
  readonly amountCents: number;
}

/** Une demande de remboursement de la commande, terminées comprises. */
export interface RefundRequestReasonShape {
  readonly requestId: string;
  /** Le code du sujet (`revision`, `shortfall`…). */
  readonly reason: string;
}

/** Le code de la demande du reste — 🔴 une valeur écrite (`card_payment.refund_request.reason`). */
export const SHORTFALL_REFUND_REASON = "shortfall";
/** Seul le prestataire rend une somme qu'on peut écrire au client. */
const PROVIDER_SOURCE = "provider";
const SUCCEEDED = "succeeded";

/**
 * **Ce remboursement est-il une part du reste rendue par le prestataire ?**
 * (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 7) —
 * son montant si oui, `null` sinon.
 *
 * Le client n'apprend un montant que quand l'argent est rendu : la ligne doit
 * être `succeeded`, rendue par le prestataire (un « Réglé autrement » ne dit
 * pas ce que le client a reçu), et émise par une demande de raison
 * `shortfall` — une hausse refusée ou une baisse de révision ont leur propre
 * courriel.
 */
export function shortfallRefundedCentsOf(
  refundId: string,
  refunds: readonly RefundPartShape[],
  requests: readonly RefundRequestReasonShape[],
): number | null {
  const refund = refunds.find((candidate) => candidate.refundId === refundId);
  if (
    refund === undefined ||
    refund.requestId === null ||
    refund.source !== PROVIDER_SOURCE ||
    refund.status !== SUCCEEDED
  ) {
    return null;
  }
  const request = requests.find((candidate) => candidate.requestId === refund.requestId);
  return request?.reason === SHORTFALL_REFUND_REASON ? refund.amountCents : null;
}
