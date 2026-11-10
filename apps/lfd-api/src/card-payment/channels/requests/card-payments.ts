import type {
  CardIntentState,
  IntentCancellation,
} from "../../domain/ports/card-provider-types.js";
import type { CardSubject, SubjectPaymentRole, SubjectSettledState } from "../subjects/index.js";

/**
 * Une intention créée chez le prestataire, pas encore rattachée — ce que
 * `prepare` rend et qu'`attach` (ou `release`) reprend tel quel. L'appelant
 * n'y lit que `providerRef` (qu'il garde sur son sujet, `orders` en P0) : le
 * compte y est choisi par le bloc, jamais par lui.
 */
export interface PreparedCardPayment {
  readonly account: string;
  readonly providerRef: string;
  readonly amountCents: number;
}

/** Ce que `prepare` rend au navigateur, par l'appelant. */
export interface CardPaymentPreparation {
  readonly prepared: PreparedCardPayment;
  readonly clientSecret: string;
  readonly publishableKey: string;
}

/** La ligne rattachée. */
export interface AttachedCardPayment {
  readonly paymentId: string;
  readonly providerRef: string;
}

/** Un paiement relu chez son prestataire, pour être réglé (la page de règlement). */
export interface RetrievedCardPayment {
  readonly paymentId: string;
  readonly providerRef: string;
  readonly clientSecret: string;
  readonly publishableKey: string;
  readonly state: CardIntentState;
}

export type { CardIntentState, IntentCancellation as CardPaymentCancellation };

/**
 * Ce que `settleFromProvider` a constaté chez le prestataire :
 * - `paid` — l'intention est encaissée, et le chemin du webhook a été rejoué
 *   (ou l'avait déjà été : la machine de la ligne dédoublonne) ;
 * - `pending` — rien de décidé (`awaiting_payment`, `processing`) ;
 * - `closed` — l'intention est annulée, la ligne fermée.
 */
export type CardProviderSettlement = "paid" | "pending" | "closed";

/**
 * **Encaisser par carte** (plan M2, §3.3) — déclaré ET implémenté par
 * `card-payment`, appelé par la passation, la page de règlement, l'abandon,
 * l'expiration et la clôture (lot P0.c2).
 *
 * L'ordre est celui d'aujourd'hui (`order-settlement.ts`) : l'intention est
 * créée HORS transaction (`prepare`), la ligne écrite DANS celle de
 * l'appelant (`attach`), et l'intention annulée au mieux si la transaction
 * échoue (`release`). Le compte est choisi par type de sujet (`default_for`) :
 * l'appelant n'en nomme aucun.
 */
export abstract class CardPayments {
  /**
   * Crée l'intention chez le prestataire du compte de ce type de sujet.
   * 🔴 HORS transaction. `tag` est opaque (`companyId` ou `personal`).
   *
   * @throws {NoCardAccountForSubjectTypeError} aucun compte pour ce type.
   * @throws {CardAccountUnavailableError} compte non configuré.
   * @throws {CardProviderUnavailableError} réponse inexploitable.
   */
  abstract prepare(
    subjectType: string,
    amountCents: number,
    tag: string,
  ): Promise<CardPaymentPreparation>;

  /**
   * Rattache l'intention préparée au sujet : la ligne naît `pending`, DANS la
   * transaction de l'appelant — elle tombe avec la sienne.
   */
  abstract attach(
    subject: CardSubject,
    prepared: PreparedCardPayment,
    role: SubjectPaymentRole,
  ): Promise<AttachedCardPayment>;

  /** La transaction de l'appelant a échoué : annule l'intention, au mieux. Ne lève pas. */
  abstract release(prepared: PreparedCardPayment): Promise<void>;

  /**
   * Relit le paiement chez son prestataire, sur le compte DE LA LIGNE.
   * 🔴 HORS transaction.
   * @throws {CardPaymentNotFoundError} aucun paiement sous cet identifiant.
   */
  abstract retrieve(paymentId: string): Promise<RetrievedCardPayment>;

  /**
   * Annule l'intention chez son prestataire, puis ferme la ligne
   * (`pending | failed → closed`) si c'est fait. 🔴 HORS transaction : il en
   * ouvre une, courte, après l'appel. Ne lève pas pour un cas métier.
   * @throws {CardPaymentNotFoundError} aucun paiement sous cet identifiant.
   */
  abstract cancel(paymentId: string): Promise<IntentCancellation>;

  /**
   * **Vérifier chez le prestataire** (plan S2, §2.7 ; premier pas du
   * « Vérifier » du §6.5 du plan M2) — le rattrapage d'un webhook perdu.
   * 🔴 HORS transaction : relit l'intention sur le compte de la ligne, puis,
   * si elle est encaissée, rejoue DANS une unité de travail le même
   * enregistrement que le webhook (le sujet est appelé avec le rôle de la
   * ligne) ; annulée, ferme la ligne.
   *
   * @throws {CardPaymentNotFoundError} aucun paiement sous cet identifiant.
   * @throws {CardProviderUnavailableError} le prestataire ne répond pas — l'appelant compte l'échec.
   */
  abstract settleFromProvider(paymentId: string): Promise<CardProviderSettlement>;

  /**
   * **Adopte** une intention que la ligne ne connaît pas (créée par l'image
   * d'avant le bloc, §4.6), à l'état que le sujet déclare — dans la
   * transaction de l'appelant, depuis SES commandes. Idempotent : une
   * référence déjà rattachée rend sa ligne. Rend l'identifiant du paiement.
   */
  abstract adopt(
    subject: CardSubject,
    providerRef: string,
    amountCents: number,
    role: SubjectPaymentRole,
    settled: SubjectSettledState,
  ): Promise<string>;
}
