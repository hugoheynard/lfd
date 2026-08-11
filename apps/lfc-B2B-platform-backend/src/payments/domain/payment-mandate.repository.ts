import type { MandateToCreate, PaymentMandate } from "./entities/payment-mandate.js";

/** L'identité de la société, telle que le prestataire la demande. */
export interface MandateHolder {
  readonly companyName: string;
  readonly email: string;
}

/**
 * Port de persistance du mandat.
 *
 * Deux lectures et deux écritures, pas plus : le mandat **courant** d'une
 * société (celui qu'on montre et sur lequel on prélèvera), un mandat par son id,
 * la création et la mise à jour. Pas de `findAll` — personne n'a besoin de la
 * liste des mandats, et une méthode qu'aucun appelant ne réclame est une surface
 * à maintenir pour rien.
 */
export abstract class PaymentMandateRepository {
  /**
   * Le mandat **courant** d'une société : l'actif s'il existe, sinon le dernier
   * enregistré. `null` si la société n'en a jamais eu.
   *
   * Rendre le dernier révoqué plutôt que `null` est délibéré : une fiche doit
   * pouvoir dire « mandat révoqué le 3 mars », pas « aucun mandat » — ce qui
   * ferait croire qu'on n'a jamais rien signé avec ce client.
   */
  abstract findCurrent(companyId: string): Promise<PaymentMandate | null>;

  /** Un mandat par son id, ou `null`. */
  abstract findById(mandateId: string): Promise<PaymentMandate | null>;

  /** Écrit un mandat neuf et rend son id. */
  abstract create(mandate: MandateToCreate): Promise<string>;

  /** Réécrit un mandat existant (révocation, dépôt de la preuve). */
  abstract save(mandate: PaymentMandate): Promise<void>;

  /**
   * L'identité de la société pour le prestataire, ou `null` si l'id est inconnu.
   *
   * Ici plutôt que par un import du contexte `account` : le paiement n'a besoin
   * que de deux chaînes, et dépendre de tout l'agrégat société pour les obtenir
   * couplerait deux contextes pour rien (ISP).
   */
  abstract findHolder(companyId: string): Promise<MandateHolder | null>;

  /**
   * L'id du client Stripe déjà utilisé pour cette société, tous mandats
   * confondus — un client par société, pas par autorisation. `null` si aucun.
   */
  abstract findStripeCustomerId(companyId: string): Promise<string | null>;
}
