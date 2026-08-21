import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MediaStore } from "../../../../platform/storage/media-store.js";
import { MediaLibrary, type RegisteredMedia } from "../domain/ports/media-library.js";
import { productImage } from "../domain/value-objects/product-image.js";

/** Le préfixe d'usage dans le bucket. Il nomme l'emploi, pas un propriétaire. */
const PREFIX = "products";

/** Ce que rend un dépôt : l'entrée de bibliothèque créée. */
export type UploadProductImageResult = RegisteredMedia;

export class UploadProductImageCommand {
  constructor(readonly bytes: Buffer) {}
}

/**
 * Dépose une image dans la bibliothèque de visuels.
 *
 * **Pas attachée à un produit** — délibérément. Le modèle a toujours séparé le
 * fichier (`MediaAsset`) de son emploi (`ProductMedia`), et déposer est un
 * geste qui précède la décision d'où l'image sert. C'est aussi ce qui permet
 * d'illustrer un produit qui n'existe pas encore, à la création.
 *
 * L'ordre compte : on valide, on range, puis on inscrit. Une image refusée ne
 * laisse rien derrière elle ; un dépôt R2 en échec n'inscrit rien en base. Le
 * seul reste possible est un objet rangé dont l'inscription échoue — sans
 * conséquence, puisque l'objet est adressé par son contenu et sera réécrit à
 * l'identique au prochain dépôt.
 */
@CommandHandler(UploadProductImageCommand)
export class UploadProductImageHandler implements ICommandHandler<
  UploadProductImageCommand,
  RegisteredMedia
> {
  constructor(
    private readonly store: MediaStore,
    private readonly library: MediaLibrary,
  ) {}

  async execute(command: UploadProductImageCommand): Promise<RegisteredMedia> {
    const image = productImage(command.bytes);
    const stored = await this.store.put(PREFIX, {
      bytes: image.bytes,
      contentType: image.contentType,
    });
    return this.library.register({
      url: stored.url,
      storageKey: stored.storageKey,
      contentType: image.contentType,
      width: image.width,
      height: image.height,
      bytes: image.byteLength,
    });
  }
}
