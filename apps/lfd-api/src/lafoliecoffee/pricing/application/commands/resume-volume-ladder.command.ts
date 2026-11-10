/** **Reprendre** un barème — l'un des trois gestes, voir `PauseVolumeLadderCommand`. */
export class ResumeVolumeLadderCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
  ) {}
}
