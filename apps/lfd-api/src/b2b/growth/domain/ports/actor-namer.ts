import type { ActivityActorType } from "../activity-event.js";

/** Qui agit, tel qu'on le figera : son nom, et sa fonction s'il en a une. */
export interface ActorIdentity {
  readonly name: string | null;
  /**
   * La fonction **en clair** (« Commercial »), pas la clé du rôle. Un journal se
   * relit dans six mois : figer « Comptabilité » survit au renommage du rôle,
   * et évite à l'écran d'embarquer la table des libellés.
   *
   * Pour un **client**, sa qualité au moment de l'acte (décision de Hugo du
   * 2026-10-30, §7 du plan des phrases) : {@link CUSTOMER_QUALITY}. `null`
   * sur les lignes d'avant.
   */
  readonly role: string | null;
}

/**
 * La qualité d'un client, en clair, comme la fonction d'un membre du staff :
 * **pro** quand il agit pour une société active, **particulier** sinon — la
 * seule définition de « qui est pro » du dépôt (`audienceOf`, `@lfd/contracts`).
 */
export const CUSTOMER_QUALITY = {
  b2b: "client pro",
  b2c: "client particulier",
} as const;

/**
 * Comment s'appelle celui qui agit — et à quel titre — **au moment où il agit**.
 *
 * Port **étroit** (ISP) : le journal n'a besoin que de deux chaînes à figer, pas
 * de l'annuaire staff ni du profil client. `growth/` déclare donc sa propre
 * dépendance plutôt que d'importer le port d'`account/` — les deux contextes
 * poseraient la même question pour des raisons différentes, et celui-ci a le
 * droit de répondre « je ne sais pas » sans casser quoi que ce soit.
 *
 * `null` n'est pas une erreur : acteur `system`, `sub` de développement, ou
 * fiche non provisionnée. Le journal affiche alors la **nature** de l'acteur
 * (« un membre du staff ») — ce qui reste vrai — plutôt qu'un nom inventé ou un
 * identifiant technique au milieu d'une phrase.
 */
export abstract class ActorNamer {
  /**
   * @param actingCompanyId la société pour laquelle la requête agit, ou `null`
   *   — ce qui fait d'un client un pro ou un particulier.
   */
  abstract describe(
    type: ActivityActorType,
    id: string | null,
    actingCompanyId: string | null,
  ): Promise<ActorIdentity>;
}
