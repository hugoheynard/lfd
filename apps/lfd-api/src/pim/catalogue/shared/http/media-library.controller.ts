import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  mediaDetailsPayloadSchema,
  type MediaLibraryPageView,
  type UploadedMediaView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import {
  UploadProductImageCommand,
  type UploadProductImageResult,
} from "../../product/application/upload-product-image.js";
import { UnsupportedImageError } from "../../product/domain/value-objects/product-image.js";
import { BrowseMediaLibraryQuery } from "../application/browse-media-library.js";
import { DiscardMediaCommand } from "../application/discard-media.js";
import { SaveMediaDetailsCommand } from "../application/save-media-details.js";

/**
 * Garde-fou DoS du multipart, **très au-dessus** de la limite métier (le
 * domaine tranche à 10 Mo). Les deux ne disent pas la même chose : celui-ci
 * empêche de saturer la mémoire du processus, celui du domaine énonce ce qu'est
 * un visuel de catalogue acceptable.
 */
const IMAGE_UPLOAD_HARD_LIMIT = 25 * 1024 * 1024;

/** Le repli quand le paramètre manque ou n'est pas un nombre. Le handler
 *  reborne de toute façon — ceci évite juste de lui passer un `NaN`. */
const DEFAULT_PAGE = 60;

/** Le peu qu'on lit du fichier Multer. Le nom d'origine ne sert à RIEN ici :
 *  la clé vient du hachage du contenu, et le type des octets. */
interface UploadedFilePart {
  readonly buffer: Buffer;
}

/**
 * **LA MÉDIATHÈQUE** — le fonds d'images, indépendamment de ce qui l'affiche.
 *
 * 🔴 Sa surface est `mediatheque`, et plus `catalogue/media` (2026-09-23). Ce
 * n'est pas un rangement : une route sous `catalogue/` affirme que le
 * référentiel produit possède la bibliothèque. Il ne la possède pas — les
 * fiches en portent, les familles aussi (`CategoryMedia`), et les contenus de
 * la vitrine en porteront. Le domaine le dit depuis que les value-objects sont
 * sortis de `product/` : « ni l'un ni l'autre ne possède la bibliothèque ».
 *
 * ⚠️ **Le préfixe `/pim` reste**, et il reste pour exactement la même raison
 * que le schéma Postgres : il est monté par le BLOC (`pim.module.ts`), et le
 * code vit encore dans ce bloc. Les deux tomberont ensemble, au même
 * déclencheur — le jour où le premier visuel de vitrine entre dans la
 * bibliothèque (cf. `documentation/pim/plan-la-mediatheque.md` §3 bis).
 *
 * Même mur que le catalogue (`@AdminSurface("pim_catalog")`) : identité
 * vérifiée contre l'annuaire, puis périmètre.
 */
@AdminSurface("pim_catalog")
@Controller("mediatheque")
export class MediaLibraryController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Parcourt la bibliothèque, une page à la fois.
   *
   * 🔴 Une image y apparaît **une seule fois**, quel qu'ait été son nombre
   * d'inscriptions : l'identité est l'URL, et la lecture groupe par elle (cf.
   * `MediaLibraryReader`). Sans ce groupement, la liste montrerait la même
   * photo autant de fois qu'on a enregistré les fiches qui la portent.
   *
   * Le bornage réel est dans le handler, pas ici : un contrôleur peut se
   * tromper, et « toute la bibliothèque » n'est pas une intention qu'on sert.
   */
  @Get()
  async browse(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<MediaLibraryPageView> {
    return this.queries.execute<BrowseMediaLibraryQuery, MediaLibraryPageView>(
      new BrowseMediaLibraryQuery(numberOr(limit, DEFAULT_PAGE), numberOr(offset, 0)),
    );
  }

  /**
   * Nomme, tague et pointe une image.
   *
   * 🔴 La clé est l'**URL** dans le corps, et non un identifiant dans le
   * chemin : les inscriptions sont recréées à chaque enregistrement de fiche,
   * donc un identifiant d'actif ne désigne rien de durable.
   *
   * Le contrôleur ne valide que la FORME (Zod). Ce qu'est un tag acceptable —
   * découpé, en minuscules, dédoublonné, borné — est une règle du domaine, et
   * elle vit dans `mediaTags`.
   */
  @Put()
  async describe(@Body() body: unknown): Promise<void> {
    const payload = mediaDetailsPayloadSchema.parse(body);
    await this.commands.execute<SaveMediaDetailsCommand, void>(
      new SaveMediaDetailsCommand(payload.url, payload.name, payload.tags, payload.focal),
    );
  }

  /**
   * Retire une image de la bibliothèque — octets compris.
   *
   * 🔴 **Refusé en 409 si un porteur l'affiche**, avec leur NOMBRE dans le
   * message. La base le refuserait de toute façon (`ON DELETE RESTRICT`) ; ce
   * refus-ci arrive avant, et il dit combien.
   *
   * L'URL en paramètre de requête et non dans le chemin : elle contient des
   * `/`, et l'encoder dans un segment la rendrait illisible dans les journaux
   * comme dans une barre d'adresse.
   */
  @Delete()
  @HttpCode(204)
  async discard(@Query("url") url?: string): Promise<void> {
    await this.commands.execute<DiscardMediaCommand, void>(new DiscardMediaCommand(url ?? ""));
  }

  /**
   * Dépose une image et rend son entrée de bibliothèque.
   *
   * Aucune validation ici : le contrôleur ne fait que le transport. C'est
   * `productImage` qui décide, en relisant les octets — ni le `Content-Type`
   * annoncé, ni l'extension ne sont crus.
   */
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: IMAGE_UPLOAD_HARD_LIMIT } }))
  async upload(@UploadedFile() file: UploadedFilePart | undefined): Promise<UploadedMediaView> {
    if (file === undefined) {
      throw new UnsupportedImageError("aucun fichier reçu.");
    }
    return this.commands.execute<UploadProductImageCommand, UploadProductImageResult>(
      new UploadProductImageCommand(file.buffer),
    );
  }
}

function numberOr(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
