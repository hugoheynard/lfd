/**
 * Ce que le carnet demande d'une société : existe-t-elle, et comment
 * s'appelle-t-elle ?
 *
 * Port **étroit** (ISP) : le carnet n'a besoin ni de l'identité légale, ni du
 * statut, ni des adresses. Une note se pose sur un client quel que soit son
 * statut — un prospect en attente se prépare, un compte résilié se relit —, donc
 * seule l'absence refuse. Le nom sert au journal, qui fige celui du moment
 * (lot B du plan des phrases, 2026-09-19).
 */
export abstract class NotebookCompanies {
  /** Vrai si une société existe sous cet identifiant. */
  abstract exists(companyId: string): Promise<boolean>;

  /**
   * Le nom qu'affichent les écrans — l'enseigne, à défaut la raison sociale —,
   * ou `null` si aucune société n'existe sous cet identifiant.
   */
  abstract nameOf(companyId: string): Promise<string | null>;
}
