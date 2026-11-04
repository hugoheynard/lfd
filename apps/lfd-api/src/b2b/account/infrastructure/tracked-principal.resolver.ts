import { PrincipalResolver } from "../../../platform/auth/principal.resolver.js";
import type { Principal, VerifiedToken } from "../../../platform/auth/principal.js";

/** Un principal résolu, et s'il peut être gardé en mémoire. */
export interface PrincipalResolution {
  readonly principal: Principal;
  /**
   * `true` seulement sur le chemin qui n'a RIEN écrit et dont le résultat ne
   * dépend que de la base — donc de l'estampille
   * (`documentation/caching-usage/plan-principal-en-memoire.md`, §2).
   */
  readonly storable: boolean;
}

/**
 * **La résolution qui dit si elle a écrit.** Le résolveur gardé en mémoire
 * ({@link CachedPrincipalResolver}) ne range que ce qu'une relecture rendrait
 * à l'identique ; seul le résolveur de la base sait si son chemin a créé un
 * compte, accepté une invitation ou recopié une preuve.
 *
 * Classe abstraite à part, plutôt qu'une méthode de plus sur le port
 * {@link PrincipalResolver} : le guard n'a pas à le savoir, et seul le
 * résolveur gardé l'appelle.
 */
export abstract class TrackedPrincipalResolver extends PrincipalResolver {
  abstract resolveTracked(token: VerifiedToken): Promise<PrincipalResolution>;
}
