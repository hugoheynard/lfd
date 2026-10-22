/** La page « Nos établissements » : les sociétés déclarées à nous. */
export class ListOwnEstablishmentsQuery {}

/** L'outil d'essai : chaque établissement, prélevable ou pourquoi pas. */
export class GetCollectionTestDebtorsQuery {}

/** La liste « Essais », du plus récent au plus ancien. */
export class ListCollectionTestsQuery {}

/** Le fichier GARDÉ d'un essai — relu, jamais rendu de nouveau. */
export class ExportCollectionTestFileQuery {
  constructor(readonly testId: string) {}
}

/**
 * Le fichier d'import du mandat d'UN établissement pour la banque — le même
 * format que l'export de l'entité, sans figer d'export (plan §7).
 */
export class ExportCollectionTestMandateQuery {
  constructor(readonly companyId: string) {}
}
