import type { RegisteredMandate } from "./entities/payment-mandate.js";

/** Ce qu'il faut au prestataire pour créer le mandat. */
export interface MandateToRegister {
  readonly companyId: string;
  /** Raison sociale — ce que le débiteur lira sur son relevé côté Stripe. */
  readonly companyName: string;
  /** E-mail du détenteur : Stripe l'exige pour un mandat SEPA. */
  readonly email: string;
  /** Le moyen de paiement créé par l'IBAN Element, côté navigateur. */
  readonly paymentMethodId: string;
  /**
   * Le client Stripe déjà connu de cette société, ou `null` pour en créer un.
   * Un client Stripe par société, pas par mandat : sinon l'historique se
   * fragmente et le portefeuille devient illisible côté prestataire.
   */
  readonly existingCustomerId: string | null;
  /** Date du mandat **papier** signé, déclarée comme acceptation hors ligne. */
  readonly acceptedAt: Date;
}

/**
 * Port du **prestataire de mandats** (Stripe).
 *
 * Séparé de `PaymentGateway` — encaisser une commande et enregistrer une
 * autorisation permanente sont deux métiers, et un consommateur ne doit dépendre
 * que de celui qu'il appelle (ISP). Le premier crée des intentions ponctuelles,
 * le second pose un instrument durable.
 *
 * **L'IBAN n'entre jamais ici** : il est saisi dans l'iframe du prestataire, et
 * le navigateur ne nous rend qu'un identifiant de moyen de paiement. Ce port
 * transporte donc des identifiants, jamais de la donnée bancaire.
 */
export abstract class MandateGateway {
  /**
   * Crée le mandat chez le prestataire et rend de quoi le reconnaître.
   *
   * L'acceptation est déclarée **hors ligne** : le client n'a rien cliqué, nous
   * affirmons détenir son mandat signé. En contestation, la charge de la preuve
   * est sur nous — d'où la pièce justificative attendue par l'agrégat.
   *
   * @throws {PaymentGatewayUnavailableError} canal non configuré ou refus du prestataire.
   */
  abstract registerMandate(input: MandateToRegister): Promise<RegisteredMandate>;

  /**
   * Détache le moyen de paiement chez le prestataire, pour qu'aucun prélèvement
   * ne puisse plus partir dessus. Silencieux si le moyen a déjà disparu :
   * révoquer deux fois ne doit pas bloquer la révocation côté métier.
   *
   * @throws {PaymentGatewayUnavailableError} canal non configuré.
   */
  abstract revokeMandate(paymentMethodId: string): Promise<void>;
}
