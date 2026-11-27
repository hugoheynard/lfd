/** Retire une colonne encore en brouillon. `actorUserId` du `Principal`, `companyId` de l'espace. */
export class WithdrawPlannedColumnCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly columnId: string,
  ) {}
}
