/** Les entités émettrices, toutes — il y en aura une ou deux. */
export class ListLegalEntitiesQuery {}

export class GetLegalEntityQuery {
  constructor(readonly legalEntityId: string) {}
}
