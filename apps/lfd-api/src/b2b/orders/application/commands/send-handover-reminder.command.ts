/**
 * **« Rappel au client »** — depuis la Supervision, quand la commande prête
 * attend un client qui n'est pas venu (Hugo, 2026-10-25). Une fois par
 * commande, passé le délai réglé après la fin du créneau.
 *
 * `staffUserId` n'est jamais dans la charge utile : il vient de la fiche
 * résolue par `StaffAccessGuard`. Un rappel part au nom de quelqu'un, et la
 * commande le garde (« Rappel envoyé le … par … »).
 */
export class SendHandoverReminderCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
