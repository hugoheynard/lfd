import type { PayLink } from "../entities/pay-link.js";

/**
 * **Le port d'écriture des liens** : il prend et rend l'agrégat. Passe par le
 * client ambiant — sous une unité de travail, il écrit dans la transaction
 * de l'appelant (l'émission d'une facture ouvre son lien dans la sienne).
 */
export abstract class PayLinkRepository {
  /**
   * Écrit un lien NEUF si son sujet n'a pas déjà un lien vivant (ni son
   * jeton, ni son identifiant pris) — sans erreur qui annulerait la
   * transaction de l'appelant. Rend `true` s'il a été écrit.
   */
  abstract addIfAbsent(link: PayLink): Promise<boolean>;

  /** Le lien vivant du sujet, **sous verrou** quand une transaction est ouverte. */
  abstract liveOf(subjectType: string, subjectId: string): Promise<PayLink | null>;

  /** Le lien qui porte cette empreinte de jeton, vivant ou révoqué. */
  abstract byTokenHash(tokenHash: string): Promise<PayLink | null>;

  /** Écrit la révocation : le reste est immuable (déclencheur). */
  abstract save(link: PayLink): Promise<void>;
}
