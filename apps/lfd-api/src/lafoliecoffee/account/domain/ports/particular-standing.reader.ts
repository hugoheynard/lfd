/**
 * Ce qu'une fiche est, vue de la saisie particulier au comptoir :
 *
 * - `particular` — non désactivée, rattachée à aucune société (ni membre, ni
 *   invitée à l'être) : on peut lui noter une commande ;
 * - `company_member` — rattachée à une société : sa commande passe par la
 *   saisie pro ;
 * - `disabled` — fiche désactivée ;
 * - `unknown` — aucune fiche sous cet identifiant.
 */
export type ParticularStanding = "particular" | "company_member" | "disabled" | "unknown";

/**
 * Port de **lecture** : la fiche choisie au comptoir est-elle bien un
 * particulier ? Même définition que la recherche (`ParticularFinder`) — le
 * comptoir ne doit pas pouvoir noter une commande de particulier pour une
 * fiche que la recherche ne lui aurait pas montrée.
 *
 * Déclaré et implémenté par `account`, qui possède `users` ; les commandes
 * l'appellent (« le propriétaire parle de ce qui est à lui »).
 */
export abstract class ParticularStandingReader {
  abstract standingOf(userId: string): Promise<ParticularStanding>;
}
