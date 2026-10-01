/** Le plan de chargement de MA tournée (PL1). */
export class GetMyLoadingPlanQuery {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
  ) {}
}
