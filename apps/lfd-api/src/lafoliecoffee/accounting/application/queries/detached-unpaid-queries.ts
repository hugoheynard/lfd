/** Les impayés de sites détachés que voit une société, depuis la fiche client. */
export class GetDetachedUnpaidOrdersQuery {
  constructor(readonly companyId: string) {}
}

/** Les mêmes, lus par un **client** — le demandeur décide du mur. */
export class GetMyDetachedUnpaidOrdersQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
