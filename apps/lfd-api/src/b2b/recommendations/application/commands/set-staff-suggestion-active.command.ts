/** **Couper ou rallumer** une suggestion, sans rien supprimer. */
export class SetStaffSuggestionActiveCommand {
  constructor(
    readonly id: string,
    readonly active: boolean,
    readonly writtenBy: string | null,
  ) {}
}
