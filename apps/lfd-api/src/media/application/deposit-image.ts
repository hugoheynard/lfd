import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MediaStore } from "../../platform/storage/media-store.js";
import { PIM_EVENTS, PimJournal } from "../../pim/journal/pim-journal.js";
import { MediaLibrary, type RegisteredMedia } from "../domain/ports/media-library.js";
import { productImage } from "../domain/value-objects/image-bytes.js";

/** Le préfixe d'usage dans le bucket. Il nomme l'emploi, pas un propriétaire. */
const PREFIX = "products";

/** Ce que rend un dépôt : l'entrée de bibliothèque créée. */
export type DepositImageResult = RegisteredMedia;

export class DepositImageCommand {
  constructor(readonly bytes: Buffer) {}
}

/**
 * Dépose une image dans la bibliothèque de visuels.
 *
 * ⚠️ Il s'appelait `UploadProductImage` jusqu'au 2026-09-23, et le mot
 * « produit » y était faux depuis longtemps : une famille dépose aussi, et la
 * vitrine déposera. Un dépôt ne touche AUCUN porteur.
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
@CommandHandler(DepositImageCommand)
export class DepositImageHandler implements ICommandHandler<DepositImageCommand, RegisteredMedia> {
  constructor(
    private readonly store: MediaStore,
    private readonly library: MediaLibrary,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DepositImageCommand): Promise<RegisteredMedia> {
    const image = productImage(command.bytes);
    const stored = await this.store.put(PREFIX, {
      bytes: image.bytes,
      contentType: image.contentType,
    });
    // 🔴 Le fait est posé DANS la transaction de l'inscription : un dépôt dont
    // la trace échouerait laisserait une image dans la bibliothèque que rien
    // n'explique, et une lacune de journal ne se rattrape pas.
    //
    // L'objet R2, lui, est déjà rangé — et c'est sans conséquence : il est
    // adressé par son contenu, donc un second dépôt du même fichier le réécrit
    // à l'identique. Le ramassage prendra celui-ci si personne ne l'attache.
    return this.uow.run(async () => {
      await this.journal.trace({
        type: PIM_EVENTS.mediaDeposited,
        subjectType: "media_asset",
        // L'URL : c'est l'identité de l'image, et elle survivra aux
        // inscriptions que les enregistrements de fiche recréeront.
        subjectId: stored.url,
        payload: {
          // Le nom de fichier du bucket, pas l'URL entière : une ligne de
          // journal se lit par quelqu'un qui n'a pas le code sous les yeux.
          subjectLabel: stored.storageKey.split("/").at(-1) ?? stored.storageKey,
          contentType: image.contentType,
          bytes: image.byteLength,
          width: image.width,
          height: image.height,
        },
      });
      return this.library.register({
        url: stored.url,
        storageKey: stored.storageKey,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        bytes: image.byteLength,
      });
    });
  }
}
