/** Un établissement déclaré, pour la page et pour l'outil d'essai. */
export interface OwnEstablishmentRow {
  readonly companyId: string;
  readonly companyName: string;
  readonly companyStatus: string;
  readonly declaredAt: Date;
  readonly declaredByStaffId: string;
}

/** Port de lecture de la liste de nos établissements — les seuls déclarés. */
export abstract class OwnEstablishmentsReader {
  /** Par raison sociale. Une société retirée n'y est pas. */
  abstract list(): Promise<readonly OwnEstablishmentRow[]>;
}
