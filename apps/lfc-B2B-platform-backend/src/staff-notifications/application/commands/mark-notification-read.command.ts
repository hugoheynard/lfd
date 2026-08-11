/**
 * Commande **staff** : marquer une notification lue, ou **toutes**.
 *
 * `id` à `null` veut dire « tout » — un seul cas d'usage, une seule commande :
 * en scinder deux ferait deux handlers pour une même intention.
 */
export class MarkNotificationReadCommand {
  constructor(
    readonly id: string | null,
    readonly staffSub: string,
  ) {}
}
