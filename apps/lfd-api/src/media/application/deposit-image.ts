import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppError } from "../../platform/shared/errors/app-error.js";
import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MediaStore } from "../../platform/storage/media-store.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { MediaFailureLog } from "../domain/ports/media-failure-log.js";
import { MediaLibrary, type RegisteredMedia } from "../domain/ports/media-library.js";
import { productImage, type ProductImage } from "../domain/value-objects/image-bytes.js";

/** Le préfixe d'usage dans le bucket. Il nomme l'emploi, pas un propriétaire. */
const PREFIX = "products";

/** Ce que rend un dépôt : l'entrée de bibliothèque créée. */
export type DepositImageResult = RegisteredMedia;

export class DepositImageCommand {
  constructor(
    readonly bytes: Buffer,
    /**
     * Le nom que le navigateur a envoyé.
     *
     * 🔴 Il ne sert **à rien au dépôt** — la clé de stockage est le SHA-256 du
     * contenu, et le type est constaté dans les octets. Il sert au REFUS : sur
     * un lot de cinquante fichiers, « lequel n'est pas passé » n'a de réponse
     * que par ce nom-là. Le porter jusqu'ici est donc son seul emploi, et
     * c'est pour ça qu'il est facultatif.
     */
    readonly fileName: string = "",
  ) {}
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
    private readonly journal: MediaJournal,
    private readonly failures: MediaFailureLog,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DepositImageCommand): Promise<RegisteredMedia> {
    const image = await this.validated(command);
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
        type: MEDIA_EVENTS.mediaDeposited,
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

  /**
   * Relit les octets, et **inscrit le refus** avant de le relancer.
   *
   * 🔴 **Hors de toute transaction, et c'est le point.** Le refus est levé
   * AVANT que l'unité de travail du dépôt s'ouvre ; y ranger l'inscription la
   * ferait emporter par le rollback, et l'historique serait vide précisément
   * les jours où il sert. `MediaFailureLog.record` ouvre donc la sienne.
   *
   * ⚠️ Et il **relance toujours**. L'historique observe, il n'absout pas : un
   * fichier refusé reste refusé, et l'appelant reçoit sa raison — celle qui
   * dit quoi corriger.
   *
   * On n'inscrit que les refus MÉTIER (`AppError`). Une panne de lecture
   * d'octets n'apprend rien sur le fichier et remplirait l'historique de
   * lignes qui parlent de nous, pas de lui.
   */
  private async validated(command: DepositImageCommand): Promise<ProductImage> {
    try {
      return productImage(command.bytes);
    } catch (caught) {
      if (caught instanceof AppError) {
        await this.failures.record({
          fileName: command.fileName,
          reason: caught.message,
          code: caught.code,
          // Ce qu'on SAIT, et rien de plus : la taille est toujours
          // mesurable, le type non — un refus pour type non supporté n'a, par
          // construction, pas de type constaté. `null` dit « pas mesurable »,
          // pas « vide ».
          bytes: command.bytes.length,
          contentType: null,
        });
      }
      throw caught;
    }
  }
}
