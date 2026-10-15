import type { OperationPresentationInput } from "../../domain/entities/operation.js";

/** **Réécrire ce que l'annonce affiche** : le nom, l'accroche, l'image. */
export class EditOperationCommand {
  constructor(
    readonly key: string,
    readonly presentation: OperationPresentationInput,
    readonly writtenBy: string | null,
  ) {}
}
