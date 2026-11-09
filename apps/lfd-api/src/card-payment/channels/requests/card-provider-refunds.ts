import type {
  IssuedRefund,
  RefundIssuance,
  RefundLookup,
  RefundRemainderParams,
} from "../../domain/ports/card-provider-types.js";

export type { IssuedRefund, RefundIssuance, RefundLookup, RefundRemainderParams };

/**
 * **Le remboursement chez le prestataire, par compte — TRANSITOIRE** (plan
 * M2, §4.2 ; posé le 2026-11-09, retiré en P1 quand le remboursement
 * déménage dans `card-payment`).
 *
 * En P0, le remboursement reste dans `b2b/orders`, sur ses tables : ce port
 * est `PaymentRefunder` d'aujourd'hui, la même signature, désormais PAR
 * COMPTE et par référence — pour que seul `card-payment` parle au
 * prestataire des cartes.
 *
 * 🔴 Ne s'appelle JAMAIS sous une transaction. Ne lève jamais : un compte
 * inconnu ou non configuré rend `unavailable`.
 */
export abstract class CardProviderRefunds {
  abstract refundRemainder(
    account: string,
    providerRef: string,
    params: RefundRemainderParams,
  ): Promise<RefundIssuance>;

  abstract findRefund(
    account: string,
    providerRef: string,
    params: RefundRemainderParams,
  ): Promise<RefundLookup>;
}
