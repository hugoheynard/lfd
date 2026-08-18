/**
 * Qui est le staff derrière un `sub`, au moment où il agit.
 *
 * Port **étroit** (ISP) : certifier un KBIS a besoin d'un nom et d'un titre à
 * figer dans une trace, pas de l'annuaire complet ni de ses opérations
 * d'écriture. Le domaine `account` ne dépend donc pas du repository staff — un
 * adaptateur d'infrastructure fait la jointure.
 */
export abstract class StaffDirectory {
  /**
   * L'identité rattachée à ce `sub`, ou `null` si aucune fiche ne lui
   * correspond (compte de connexion non encore provisionné, staff de dev).
   *
   * `null` n'est pas une erreur : l'appelant garde alors le seul identifiant.
   * Inventer un nom pour combler le trou serait pire que le trou.
   */
  abstract identify(subject: string): Promise<StaffIdentity | null>;
}

/** Ce qu'on fige d'un agent : son nom d'usage et son titre, à cet instant. */
export interface StaffIdentity {
  /** « Prénom Nom », tel qu'il apparaît dans l'annuaire ce jour-là. */
  readonly name: string;
  /**
   * Le périmètre au moment de l'acte (« commercial », « comptabilité »…). Vide
   * si la fiche n'en porte aucun — un agent sans périmètre reste un agent.
   */
  readonly role: string;
}
