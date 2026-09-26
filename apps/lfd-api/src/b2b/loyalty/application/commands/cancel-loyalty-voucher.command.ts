/** Le staff annule un bon disponible, avec un motif ; ses points reviennent au titulaire. */
export class CancelLoyaltyVoucherCommand {
  constructor(
    readonly voucherId: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
