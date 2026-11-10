/**
 * Les brouillons **émis par une entité**, toutes sociétés confondues.
 *
 * À part de `PaymentMandateRepository`, qui ne lit qu'une société à la fois : la
 * seule question transverse est celle d'un réglage de l'émetteur qui rend tous
 * ses brouillons caducs. Des identifiants et pas des agrégats — le chargement
 * reste l'affaire du dépôt, qui porte le seul mapper ligne → mandat.
 *
 * ⚠️ Aucun mur tenant ici, et c'est juste : l'appelant est un geste staff sur
 * NOTRE entité, pas une lecture d'un client.
 */
export abstract class IssuedDraftsReader {
  abstract draftIdsIssuedBy(creditorId: string): Promise<readonly string[]>;
}
