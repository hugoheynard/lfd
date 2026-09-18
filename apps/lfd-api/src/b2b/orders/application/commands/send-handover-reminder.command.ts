/**
 * **Renvoyer au client le courriel de retrait** — le geste du comptoir quand
 * personne n'est venu.
 *
 * `staffUserId` n'est jamais dans la charge utile : il vient de la fiche
 * résolue par `StaffAccessGuard`. Un rappel part au nom de quelqu'un, comme une remise.
 */
export class SendHandoverReminderCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
