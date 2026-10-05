/** Une commande à prélever (ou écartée) a été réglée autrement — virement, chèque… */
export class SettleOrderOtherwiseCommand {
  constructor(
    readonly orderId: string,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
