/**
 * **Clore** un engagement. Terminal, et sans effet rétroactif.
 *
 * Clore ne révise aucune commande passée : chacune garde le palier qu'elle a
 * mérité, sa trace le dit, et c'est toute la raison d'avoir choisi le cumul
 * plutôt qu'un prix fixe. La clôture libère seulement la période.
 */
export class CloseVolumeCommitmentCommand {
  constructor(
    readonly id: string,
    readonly reason: string | null,
    readonly staffUserId: string,
  ) {}
}
