/** Les compteurs d'audience d'une période, jours métier bornes comprises. */
export class ListProductAudienceCountersQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
