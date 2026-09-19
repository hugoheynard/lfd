/**
 * **Les trois gestes du barème** — suspendre, reprendre, archiver.
 *
 * Trois commandes et non une générique, pour la même raison que du côté des
 * règles : ce qui compte dans six mois n'est pas l'état atteint, c'est ce que
 * l'utilisateur croyait faire.
 *
 * Celle-ci **suspend** ; les deux autres sont `ResumeVolumeLadderCommand` et
 * `ArchiveVolumeLadderCommand`.
 */
export class PauseVolumeLadderCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
