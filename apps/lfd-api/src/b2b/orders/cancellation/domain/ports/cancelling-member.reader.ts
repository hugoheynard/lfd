/** Le compte principal par lequel une personne atteint la commande d'un site. */
export interface CancellingPrincipal {
  readonly companyId: string;
  /** Son enseigne (sa raison sociale à défaut), telle qu'elle est lue au geste. */
  readonly name: string;
}

/**
 * Pourquoi une personne peut annuler : membre de la société de la commande
 * (`own`), ou `owner`/`admin` de son principal sans l'être du site
 * (`principal`, lot C1 de `plan-commandes-des-sites.md`, §7.2, §7.9) — la
 * source que le courriel et le journal disent.
 */
export type CancellingStanding =
  { readonly via: "own" } | { readonly via: "principal"; readonly principal: CancellingPrincipal };

/**
 * **Le mur pro de l'annulation par le client** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.2, B2).
 *
 * Plus strict que la passation, et c'est voulu : `OrderGuardReader.roleOf`
 * admet une invitation vivante NON acceptée (`openingMembership`), et
 * `order-settlement.ts` fait régler par carte une société non `active` au lieu
 * de la refuser (lus le 2026-10-13). Ici, il faut un rattachement ACCEPTÉ et
 * la société DE LA COMMANDE `active` — tout rôle, `billing` compris (Q-C6.2).
 *
 * Depuis le lot C1 des sous-comptes (2026-10-21, §7.2) : les mêmes conditions
 * sur la chaîne EFFECTIVE (`effectiveRole`) — l'`owner` ou l'`admin` du
 * principal, rattachement au principal ACCEPTÉ, principal `active`, annule
 * la commande d'un site `active`. Un site suspendu refuse, quel que soit
 * l'appelant (§7.7).
 */
export abstract class CancellingMemberReader {
  /** La raison d'annuler, ou `null` : pas le droit (le refus est un 404). */
  abstract standingOn(userId: string, companyId: string): Promise<CancellingStanding | null>;
}
