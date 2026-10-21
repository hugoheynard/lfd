/** Clore une fiche de réassort : l'emballé devient lisible par le commerce (R3b). */
export class ClosePackingResupplyCommand {
  constructor(
    readonly serviceDay: string,
    readonly resupplyId: string,
    readonly staffUserId: string,
  ) {}
}
