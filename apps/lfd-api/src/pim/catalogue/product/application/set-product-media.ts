import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { mediaItems, type MediaInput } from "../domain/value-objects/editorial.js";
import { requireProduct } from "./product-support.js";

export class SetProductMediaCommand {
  constructor(
    readonly id: string,
    readonly media: readonly MediaInput[],
  ) {}
}

/**
 * Remplace les visuels d'un produit.
 *
 * Un **remplacement**, pas un ajout : l'écran envoie ce qu'il affiche, et cette
 * liste fait foi. Retirer une image et réordonner les autres sont le même geste
 * pour qui l'exécute ; les découper en routes séparées ferait porter à l'écran
 * une suite d'appels dont l'échec partiel laisserait un ordre incohérent.
 *
 * Les règles ne sont pas réécrites ici : `mediaItems` les tient déjà — URL
 * obligatoire, rôle unique là où il doit l'être, et **position dérivée du rang**
 * dans la liste reçue. Deux images ne peuvent donc pas revendiquer la même
 * place, et l'ordre affiché est l'ordre enregistré par construction.
 */
@CommandHandler(SetProductMediaCommand)
export class SetProductMediaHandler implements ICommandHandler<SetProductMediaCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialRepository,
  ) {}

  async execute(command: SetProductMediaCommand): Promise<void> {
    await requireProduct(this.products, command.id);
    await this.editorials.replaceMedia(command.id, mediaItems(command.media));
  }
}
