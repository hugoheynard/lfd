import type { CustomerRequest } from "../customer-request.js";

/** Port d'**écriture** des demandes : l'agrégat entier — enveloppe, détails, photos. */
export abstract class CustomerRequestRepository {
  abstract load(id: string): Promise<CustomerRequest | null>;
  /**
   * La demande, sa ligne VERROUILLÉE jusqu'à la fin de l'unité de travail
   * ambiante : deux réponses à une demande de modification (« Appliquer » et
   * « Refuser » en même temps) s'attendent, la seconde lit la première.
   */
  abstract lockForAnswer(id: string): Promise<CustomerRequest | null>;
  /** Crée la demande reçue, ou enregistre son traitement ou son anonymisation. */
  abstract save(request: CustomerRequest): Promise<void>;
  /**
   * Range une demande NEUVE, ou rien si une demande porte déjà la même clé
   * d'unicité — l'identifiant du message reçu, pour une réponse par e-mail
   * (plan `plan-reponses-par-e-mail.md`, §3). Insérer-ou-ignorer : c'est ce
   * qui rend un rejeu de Resend sans effet, sans verrou ni lecture préalable.
   * Rend `true` si elle a été rangée, `false` si elle l'était déjà.
   */
  abstract receiveOnce(request: CustomerRequest): Promise<boolean>;
}
