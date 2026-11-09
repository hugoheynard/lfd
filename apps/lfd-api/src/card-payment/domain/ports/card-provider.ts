import type { CardProviderEvent } from "./card-provider-event.js";
import type {
  CreateIntentParams,
  CreatedIntent,
  IntentCancellation,
  RefundIssuance,
  RefundLookup,
  RefundRemainderParams,
  RetrievedIntent,
} from "./card-provider-types.js";

/**
 * **Un prestataire de carte, pour UN compte** (plan M2, §3.2, §4.2) — l'union
 * de `PaymentGateway` et de `PaymentRefunder` d'aujourd'hui
 * (`b2b/payments/domain/`), que le lot c2 retirera.
 *
 * Une seule interface parce qu'un adaptateur par TYPE de prestataire sert
 * l'encaissement ET le remboursement d'un même compte, avec les mêmes
 * secrets ; les consommateurs, eux, ne la voient pas : ils passent par les
 * ports étroits du canal (`CardPayments`, `CardProviderRefunds`).
 *
 * 🔴 Aucune méthode ne s'appelle sous une transaction : chaque adaptateur pose
 * `assertOutsideTransaction` en tête de ses appels réseau.
 */
export abstract class CardProvider {
  /**
   * Crée une intention de paiement.
   * @throws {CardProviderUnavailableError} réponse inexploitable.
   */
  abstract createIntent(params: CreateIntentParams): Promise<CreatedIntent>;

  /**
   * Relit une intention pour son secret client et son état : le secret n'est
   * jamais persisté chez nous, il se redemande.
   * @throws {CardProviderUnavailableError} intention inconnue ou réponse sans secret.
   */
  abstract retrieveIntent(providerRef: string): Promise<RetrievedIntent>;

  /** Annule une intention. Ne lève pas : chaque issue, panne comprise, est rendue. */
  abstract cancelIntent(providerRef: string): Promise<IntentCancellation>;

  /** La clé PUBLIQUE du compte, pour le navigateur. */
  abstract publishableKey(): string;

  /**
   * Vérifie la signature d'un webhook avec le secret du compte, et réduit
   * l'événement.
   * @throws {InvalidProviderSignatureError} signature invalide — rien n'est traité.
   */
  abstract parseWebhook(rawBody: Buffer, signature: string): CardProviderEvent;

  /**
   * Cherche d'abord un remboursement de cette demande et de cette génération,
   * vivant ; sinon le crée sous la clé, sans montant. Ne lève pas.
   */
  abstract refundRemainder(
    providerRef: string,
    params: RefundRemainderParams,
  ): Promise<RefundIssuance>;

  /** La recherche seule, même filtre. Ne lève pas. */
  abstract findRefund(providerRef: string, params: RefundRemainderParams): Promise<RefundLookup>;
}
