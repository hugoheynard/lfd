/**
 * **Renvoyer au client le courriel de retrait** — le geste du comptoir quand
 * personne n'est venu.
 *
 * `staffSubject` n'est jamais dans la charge utile : il vient du `Principal`
 * résolu par le guard. Un rappel part au nom de quelqu'un, comme une remise.
 */
export class SendHandoverReminderCommand {
  constructor(
    readonly orderId: string,
    readonly staffSubject: string,
  ) {}
}
