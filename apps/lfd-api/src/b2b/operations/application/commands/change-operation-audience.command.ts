/** **Changer la clientèle** d'une opération : professionnels, particuliers, ou les deux. */
export class ChangeOperationAudienceCommand {
  constructor(
    readonly key: string,
    readonly audience: string,
    readonly writtenBy: string | null,
  ) {}
}
