import type { OperationTextInput } from "../../domain/value-objects/operation-text.js";
import type { ChosenImage } from "./operation-image-choice.js";

/**
 * **Réécrire ce que l'annonce affiche** : le nom, l'accroche, l'image —
 * choisie dans la médiathèque par son adresse, que le cas d'usage fait décrire.
 */
export class EditOperationCommand {
  constructor(
    readonly key: string,
    readonly presentation: {
      readonly name: OperationTextInput;
      readonly lede: OperationTextInput | null;
      readonly image: ChosenImage | null;
    },
    readonly writtenBy: string | null,
  ) {}
}
