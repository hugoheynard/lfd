/** Query : le journal des envois d'un abonné, du plus récent au plus ancien. */
export class ListVitrineDeliveriesQuery {
  constructor(readonly subscriberId: string) {}
}
