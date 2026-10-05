/**
 * Comment un site qui suit `billing` est prélevé (`plan-sous-comptes.md`
 * §2.1 ter). Le débiteur nommé est toujours la société du principal ; ce qui
 * change est le MANDAT, et donc le nombre de lignes du lot.
 *
 * Copie de l'énumération Postgres `CollectionForm`, et la duplication est
 * voulue : le domaine ne tire pas Prisma.
 */
export const COLLECTION_FORMS = [
  /** le mandat du principal — une ligne pour la société */
  "principal_mandate",
  /** un mandat du site, sur le RIB du principal — une ligne par site */
  "own_mandate_principal_iban",
  /** un mandat du site, sur le RIB du site — une ligne par site */
  "own_iban",
] as const;
export type CollectionFormName = (typeof COLLECTION_FORMS)[number];

/** Sans décision datée, un site est prélevé sur le mandat de son payeur. */
export const DEFAULT_COLLECTION_FORM: CollectionFormName = "principal_mandate";

/** Cette forme fait-elle prélever le site sur SON mandat ? */
export function collectsOnSiteMandate(form: CollectionFormName): boolean {
  return form !== "principal_mandate";
}
