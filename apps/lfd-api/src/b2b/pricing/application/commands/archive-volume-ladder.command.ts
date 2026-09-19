/** **Archiver** un barème — l'un des trois gestes, voir `PauseVolumeLadderCommand`. */
export class ArchiveVolumeLadderCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
