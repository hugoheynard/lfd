import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { WriteTicket } from "../../platform/journal/scoped-journal.js";
import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MediaStore, type StoredAsset } from "../../platform/storage/media-store.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { MediaLibrary, type RegisteredMedia } from "../domain/ports/media-library.js";
import { MediaSeriesReader, type MediaSeriesLabel } from "../domain/ports/media-series.js";
import { MediaSeriesNotFoundError } from "../domain/errors/media-series-errors.js";
import { MediaAlreadyRegisteredError } from "../domain/errors/media-library-errors.js";
import type { ProductImage } from "../domain/value-objects/image-bytes.js";
import { mediaFileName } from "../domain/value-objects/image.js";
import { contentAddressOf } from "../domain/value-objects/content-address.js";
import {
  imagePalette,
  type ImagePalette,
  type PaletteSwatch,
} from "../domain/value-objects/image-palette.js";
import { DepositPalette } from "./deposit-palette.js";
import { DepositRefusals } from "./deposit-refusals.js";

/**
 * Le préfixe des clés du fonds dans le bucket : la NATURE de l'objet, ni son
 * emploi ni son porteur — une image sert une fiche, une famille, la vitrine.
 *
 * ⚠️ Il valait `products` jusqu'au 2026-10-13 (plan du préfixe universel, lot
 * D1) : les lignes déjà au fonds ont été réécrites par la migration
 * `20261013500000_le_prefixe_universel_des_images`, et le redépôt retrouve une
 * image par son contenu, préfixe ignoré (`contentAddressOf`, lot D0).
 */
const MEDIA_KEY_PREFIX = "images";

/**
 * Ce que rend un dépôt : l'entrée de bibliothèque — créée, ou celle qui
 * portait déjà ces octets.
 *
 * `alreadyInLibrary` dit lequel des deux (2026-10-10) : un redépôt ne
 * change rien à l'image, sa série comprise, et le compte rendu du lot doit
 * pouvoir le dire plutôt que de laisser croire qu'elle a rejoint la série
 * choisie.
 */
export interface DepositImageResult extends RegisteredMedia {
  readonly alreadyInLibrary: boolean;
}

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
    /**
     * La série où ranger l'image NEUVE — facultative. Sans effet sur une image
     * déjà au fonds : un redépôt ne change rien (2026-10-10).
     */
    readonly seriesId: string | null = null,
    /**
     * Les couleurs, calculées par le navigateur (2026-10-11) — `null` = l'écran
     * ne les a pas envoyées, elles se rattraperont par `PUT /media/palette`.
     * Posées aussi sur une image déjà au fonds qui n'en avait pas.
     */
    readonly palette: readonly PaletteSwatch[] | null = null,
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
export class DepositImageHandler implements ICommandHandler<
  DepositImageCommand,
  DepositImageResult
> {
  constructor(
    private readonly store: MediaStore,
    private readonly library: MediaLibrary,
    private readonly series: MediaSeriesReader,
    private readonly journal: MediaJournal,
    private readonly refusals: DepositRefusals,
    private readonly uow: UnitOfWork,
    private readonly palette: DepositPalette,
  ) {}

  async execute(command: DepositImageCommand): Promise<DepositImageResult> {
    const image = await this.refusals.measured(command.bytes, command.fileName);
    // Refusées AVANT de ranger : un dépôt refusé — palette illisible, série
    // inconnue — ne doit rien laisser dans le bucket.
    const palette = command.palette === null ? null : imagePalette(command.palette);
    const series = await this.seriesOf(command.seriesId);
    const stored = await this.store.put(MEDIA_KEY_PREFIX, {
      bytes: image.bytes,
      contentType: image.contentType,
    });
    // L'objet R2 est déjà rangé, et c'est sans conséquence si la suite échoue :
    // il est adressé par son contenu, un second dépôt le réécrit à l'identique,
    // et le ramassage le prendra si personne ne l'attache.
    try {
      return await this.uow.run(() => this.registered(stored, image, series, palette));
    } catch (caught) {
      // Deux dépôts SIMULTANÉS des mêmes octets : tous deux ont lu « absente »,
      // celui-ci a perdu la course à l'unicité, sa transaction est annulée.
      // L'image est au fonds — c'est un redépôt (2026-10-11).
      const existing =
        caught instanceof MediaAlreadyRegisteredError
          ? await this.uow.run(() => this.alreadyThere(stored.storageKey, palette))
          : null;
      if (existing === null) {
        throw caught;
      }
      return existing;
    }
  }

  /**
   * Inscrit l'image neuve, ou rend celle qui portait déjà ces octets.
   *
   * 🔴 Le fait est posé DANS la transaction de l'inscription : un dépôt dont
   * la trace échouerait laisserait une image dans la bibliothèque que rien
   * n'explique, et une lacune de journal ne se rattrape pas.
   */
  private async registered(
    stored: StoredAsset,
    image: ProductImage,
    series: MediaSeriesLabel | null,
    palette: ImagePalette | null,
  ): Promise<DepositImageResult> {
    const existing = await this.alreadyThere(stored.storageKey, palette);
    if (existing !== null) {
      return existing;
    }
    const ticket = await this.traceDeposit(stored, image, series);
    const registered = await this.library.register(
      {
        url: stored.url,
        storageKey: stored.storageKey,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        bytes: image.byteLength,
        seriesId: series?.id ?? null,
      },
      ticket,
    );
    await this.palette.paint(stored.url, palette, ticket);
    return { ...registered, alreadyInLibrary: false };
  }

  /**
   * Les mêmes octets sont déjà au fonds : rien n'est écrit — ni série, ni
   * fait, il ne s'est rien passé dans la bibliothèque. Seule une palette
   * MANQUANTE se pose, parce qu'elle se déduit des octets.
   *
   * 🔴 Retrouvée par le CONTENU, pas par l'URL qu'on vient de fabriquer
   * (2026-10-13) : l'image déjà au fonds peut être rangée sous un autre
   * préfixe, et c'est SON URL qui fait foi — celle que les porteurs citent.
   * La palette se pose donc sur elle, jamais sur l'URL du dépôt.
   */
  private async alreadyThere(
    storageKey: string,
    palette: ImagePalette | null,
  ): Promise<DepositImageResult | null> {
    const existing = await this.library.holdingContent(contentAddressOf(storageKey));
    if (existing === null) {
      return null;
    }
    await this.palette.paintDeduced(existing.url, palette);
    return { ...existing, alreadyInLibrary: true };
  }

  private traceDeposit(
    stored: StoredAsset,
    image: ProductImage,
    series: MediaSeriesLabel | null,
  ): Promise<WriteTicket> {
    return this.journal.trace({
      type: MEDIA_EVENTS.mediaDeposited,
      subjectType: "media_asset",
      // L'URL : c'est l'identité de l'image, celle que les porteurs citent.
      subjectId: stored.url,
      payload: {
        subjectLabel: mediaFileName(stored.storageKey),
        contentType: image.contentType,
        bytes: image.byteLength,
        width: image.width,
        height: image.height,
        series: series === null ? null : { id: series.id, name: series.title },
      },
    });
  }

  /** La série demandée, ou `null` sans série. @throws {MediaSeriesNotFoundError} */
  private async seriesOf(id: string | null): Promise<MediaSeriesLabel | null> {
    if (id === null) {
      return null;
    }
    const series = await this.series.find(id);
    if (series === null) {
      throw new MediaSeriesNotFoundError(id);
    }
    return series;
  }
}
