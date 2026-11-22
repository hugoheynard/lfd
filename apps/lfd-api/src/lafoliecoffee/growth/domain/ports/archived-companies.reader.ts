/**
 * **Lesquelles de ces sociétés sont supprimées ?** — un compte supprimé
 * (`archived_at` posé, « Supprimer le compte ») sort du tunnel d'activation et
 * du cockpit : c'est un doublon ou une erreur de saisie, pas un dossier à
 * relancer. Un compte résilié n'en est pas : il reste dans les vues.
 *
 * Par lot, comme {@link CompanyNamer.namesOf} : une projection en demande
 * des dizaines, et une lecture par dossier ferait une requête par ligne.
 */
export abstract class ArchivedCompaniesReader {
  /** Les identifiants supprimés parmi `companyIds` ; un inconnu n'y est pas. */
  abstract among(companyIds: readonly string[]): Promise<ReadonlySet<string>>;
}
