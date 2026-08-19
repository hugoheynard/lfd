import type { StaffAccess, StaffPrincipal } from "./staff-principal.js";

/**
 * **Ce que la couche technique a le droit de savoir** d'un accès staff : qu'on
 * peut résoudre une identité prouvée en un périmètre, et qu'on peut oublier ce
 * qu'on croyait savoir.
 *
 * Un port, parce que la réponse est un fait de l'**annuaire** — quelle fiche,
 * quel rôle, quelles dérogations, et faut-il constater une première entrée.
 * L'implémentation lisait ces tables depuis `infra/auth` : le gate des
 * frontières ne l'a jamais vu, puisqu'elle n'importait rien du bloc `staff`,
 * elle interrogeait Prisma directement. Une frontière qu'on ne franchit qu'en
 * SQL est franchie quand même.
 *
 * Même geste que pour {@link PrincipalResolver} côté client, et pour la même
 * raison : le jour où ce socle se pose devant un autre contexte, il ne doit pas
 * traîner l'annuaire derrière lui.
 */
export abstract class StaffAccessResolver {
  /** @returns l'effectif de cette personne, ou `null` si l'annuaire l'ignore. */
  abstract resolve(principal: StaffPrincipal): Promise<StaffAccess | null>;

  /**
   * Oublie ce qu'on savait — appelé par l'annuaire **au moment exact** où il
   * change, plutôt qu'en attendant l'expiration. C'est ce qui fait qu'une
   * suspension mord tout de suite au lieu de mordre dans trente secondes.
   */
  abstract forgetAll(): void;
}
