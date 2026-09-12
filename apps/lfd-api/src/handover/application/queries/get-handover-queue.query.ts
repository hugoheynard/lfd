/** La file du comptoir pour un jour de service (`AAAA-MM-JJ`). */
export class GetHandoverQueueQuery {
  constructor(readonly day: string) {}
}
