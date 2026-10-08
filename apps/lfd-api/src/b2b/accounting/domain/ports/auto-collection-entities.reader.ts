/** Une entité dont la constitution automatique est activée. */
export interface AutoCollectionEntity {
  readonly legalEntityId: string;
  /** Sa raison sociale du moment — le journal nomme la tentative par elle. */
  readonly name: string;
  /** Heures entre la clôture et la constitution prévue (1 à 23). */
  readonly autoCollectionDelayHours: number;
}

/**
 * Les entités que l'automatisme doit regarder (PA3) : constitution
 * automatique activée, entité non archivée. Le reste de la fiche ne le
 * concerne pas — la constitution relit l'entité elle-même.
 */
export abstract class AutoCollectionEntitiesReader {
  abstract enabled(): Promise<readonly AutoCollectionEntity[]>;
}
