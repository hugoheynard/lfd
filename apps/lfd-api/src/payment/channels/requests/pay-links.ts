import type { CardSubject } from "../subjects/index.js";

/** L'auteur d'un lien ouvert par une émission automatique, sans geste du staff. */
export const SYSTEM_PAY_LINK_AUTHOR = "system";

/** Ce que l'appelant dit d'un lien à l'ouverture. */
export interface PayLinkRequest {
  /** L'application qui le demande — une origine du registre (`lafoliecoffee`). */
  readonly origin: string;
  /** Le nom du payeur, figé sur le lien. */
  readonly payerLabel: string;
  /** La fiche staff de l'auteur, ou {@link SYSTEM_PAY_LINK_AUTHOR}. */
  readonly by: string;
}

/** Le lien ouvert (ou celui qui vivait déjà). */
export interface OpenedPayLink {
  readonly linkId: string;
  readonly url: string;
}

/** L'adresse du lien vivant d'un sujet, pour une page de liste. */
export interface SubjectPayLinkUrl {
  readonly subject: CardSubject;
  readonly url: string;
}

/**
 * **Ouvrir un lien de paiement vers un sujet** (plan
 * `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2.2) — déclaré ET implémenté par `payment`, appelé par les blocs métier.
 *
 * Tout se passe **dans la transaction de l'appelant, sans réseau** :
 * l'intention chez le prestataire ne naît qu'à l'ouverture de la page.
 */
export abstract class PayLinks {
  /**
   * Ouvre le lien du sujet ; s'il en a déjà un vivant, rend celui-là.
   *
   * @throws {UnknownPayLinkOriginError} origine hors du registre.
   * @throws {PayLinkOriginWithoutRootError} racine publique non configurée.
   * @throws {SubjectNotLinkableError} aucun bloc ne chiffre ce type de sujet.
   * @throws {InvalidPayLinkError} sujet, payeur ou auteur mal formé.
   */
  abstract open(subject: CardSubject, request: PayLinkRequest): Promise<OpenedPayLink>;

  /**
   * Révoque le lien vivant du sujet ; sa page rend alors 404. Rend `false`
   * quand le sujet n'avait aucun lien vivant.
   *
   * @throws {InvalidPayLinkError} motif vide ou trop long.
   */
  abstract revoke(subject: CardSubject, reason: string): Promise<boolean>;

  /**
   * L'adresse du lien vivant du sujet, pour la recopier ; `null` s'il n'en a pas.
   *
   * @throws {PayLinkOriginWithoutRootError} racine publique non configurée.
   */
  abstract urlOf(subject: CardSubject): Promise<string | null>;

  /**
   * Les adresses des liens vivants de ces sujets, en UNE lecture — pour une
   * page de liste. Un sujet sans lien vivant n'y est pas ; un lien dont
   * l'adresse ne se compose pas (racine absente, scellé illisible) n'y est
   * pas non plus, et l'échec est journalisé par ligne : une ligne ne fait pas
   * tomber la liste.
   */
  abstract urlsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectPayLinkUrl[]>;
}
