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
  mediaLibraryQuerySchema,
  type MediaLibraryQuery,
  renameMediaTagPayloadSchema,
  type MediaTagView,
  type MediaLibraryPageView,
  type UploadedMediaView,
  MEDIA_LIMITS,
  type MediaCarrierView,
  type MediaUploadFailureView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { DepositImageCommand, type DepositImageResult } from "../application/deposit-image.js";
import { UnsupportedImageError } from "../domain/value-objects/image-bytes.js";
import { BrowseMediaLibraryQuery } from "../application/browse-media-library.js";
import { ListMediaCarriersQuery } from "../application/list-media-carriers.js";
import { ReadUploadFailuresQuery } from "../application/read-upload-failures.js";
import { DiscardMediaCommand } from "../application/discard-media.js";
import { SaveMediaDetailsCommand } from "../application/save-media-details.js";
import { ListMediaTagsQuery } from "../application/list-media-tags.js";
import { RenameMediaTagCommand } from "../application/rename-media-tag.js";
import { RemoveMediaTagCommand } from "../application/remove-media-tag.js";

/**
 * Garde-fou DoS du multipart, **très au-dessus** de la limite métier (le
 * domaine tranche à 10 Mo). Les deux ne disent pas la même chose : celui-ci
 * empêche de saturer la mémoire du processus, celui du domaine énonce ce qu'est
 * un visuel de catalogue acceptable.
 */
const IMAGE_UPLOAD_HARD_LIMIT = MEDIA_LIMITS.transportMaxBytes;

/**
 * Le peu qu'on lit du fichier Multer.
 *
 * ⚠️ Cette note disait « le nom d'origine ne sert à RIEN ici : la clé vient du
 * hachage du contenu, et le type des octets ». C'était exact pour le DÉPÔT, et
 * ça l'est encore. Ce qui a changé le 2026-09-23, c'est le REFUS : sur un lot
 * de cinquante fichiers, « lequel n'est pas passé » n'a de réponse que par ce
 * nom-là. Il ne sert donc à rien quand ça marche, et il est la seule prise
 * quand ça échoue.
 *
 * 🔴 **Donnée d'utilisateur** : plafonnée à l'écriture, jamais interpolée dans
 * un message sans échappement.
 */
interface UploadedFilePart {
  readonly buffer: Buffer;
  readonly originalname: string;
}

/**
 * **LA MÉDIATHÈQUE** — le fonds d'images, indépendamment de ce qui l'affiche.
 *
 * 🔴 Sa surface est `media`, et plus `catalogue/media` (2026-09-23). Ce
 * n'est pas un rangement : une route sous `catalogue/` affirme que le
 * référentiel produit possède la bibliothèque. Il ne la possède pas — les
 * fiches en portent, les familles aussi (`CategoryMedia`), et les contenus de
 * la vitrine en porteront. Le domaine le dit depuis que les value-objects sont
 * sortis de `product/` : « ni l'un ni l'autre ne possède la bibliothèque ».
 *
 * ✅ **Le préfixe `/pim` est tombé** le 2026-09-23, avec le schéma et le bloc.
 * Cette note disait qu'il « reste » et que les deux tomberaient ensemble, au
 * déclencheur du premier visuel de vitrine : c'est arrivé plus tôt, par le
 * déménagement lui-même.
 *
 * 🔴 **Son propre droit depuis le 2026-09-23** — `media_library`, et non plus
 * `pim_catalog`. L'emprunt décrivait la réalité tant que la bibliothèque
 * vivait dans le référentiel ; elle en est sortie, et « qui lit le catalogue
 * peut supprimer du fonds » ne dit plus rien de vrai.
 *
 * ⚠️ **Ce détachement RETIRE un accès**, et c'est la décision (Hugo,
 * 2026-09-23) : seuls `admin` et `communication` l'obtiennent. `commercial`,
 * `comptabilite` et `dev` perdent le fonds, **y compris en lecture** — donc le
 * bouton « Choisir dans la médiathèque » d'une fiche leur rendra 403.
 * Illustrer devient le travail de la communication, comme alimenter et taguer.
 *
 * L'action se déduit du verbe : `GET` demande `media_library:read`, tout le
 * reste `media_library:write`.
 */
@AdminSurface("media_library")
@Controller("media")
export class MediaLibraryController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Parcourt la bibliothèque, une page à la fois — ordonnée, filtrée, par
   * curseur (`after` ← `next`).
   *
   * Une image = une ligne = une URL : l'URL est unique depuis le 2026-09-23.
   *
   * Le schéma ne valide que la FORME. Le bornage, la lecture du curseur et la
   * conversion des jours en instants sont dans le handler.
   */
  @Get()
  async browse(
    @Query(new ZodQuery(mediaLibraryQuerySchema)) query: MediaLibraryQuery,
  ): Promise<MediaLibraryPageView> {
    return this.queries.execute<BrowseMediaLibraryQuery, MediaLibraryPageView>(
      new BrowseMediaLibraryQuery({
        limit: query.limit,
        offset: query.offset,
        after: query.after,
        sort: query.sort,
        q: query.q,
        tags: query.tags,
        from: query.from,
        to: query.to,
        untagged: query.untagged,
        unused: query.unused,
      }),
    );
  }

  /**
   * **Ce qui n'est PAS entré** — les derniers dépôts refusés.
   *
   * 🔴 Elle existe parce que le compte rendu d'un lot vivait en mémoire :
   * fermer l'onglet l'effaçait, et personne ne pouvait dire le lendemain ce
   * qui n'était pas entré la veille.
   *
   * ⚠️ Elle ne permet pas de REJOUER : un fichier refusé n'a pas été stocké.
   * Elle dit quoi retrouver et pourquoi ça a échoué.
   */
  @Get("failures")
  async failures(@Query("limit") limit?: string): Promise<readonly MediaUploadFailureView[]> {
    return this.queries.execute<ReadUploadFailuresQuery, readonly MediaUploadFailureView[]>(
      new ReadUploadFailuresQuery(numberOr(limit, DEFAULT_FAILURES_PAGE)),
    );
  }

  /**
   * **Qui affiche cette image ?** — nommés, pas comptés.
   *
   * 🔴 Elle rend le refus de suppression ACTIONNABLE : le compteur disait
   * « 3 fiches l'affichent » sans permettre d'en trouver une, donc empêchait
   * le geste sans donner de quoi le débloquer.
   *
   * ⚠️ L'URL est en **paramètre de requête** et non dans le chemin : elle
   * contient des barres obliques, et la mettre dans le chemin obligerait à
   * l'encoder des deux côtés — une double couche d'échappement sur la seule
   * chose qui sert d'identité ici. C'est déjà le choix de `DELETE /media`.
   */
  @Get("carriers")
  async carriers(@Query("url") url?: string): Promise<readonly MediaCarrierView[]> {
    return this.queries.execute<ListMediaCarriersQuery, readonly MediaCarrierView[]>(
      new ListMediaCarriersQuery(url ?? ""),
    );
  }

  /**
   * **Le vocabulaire** — chaque mot-clé de tout le fonds, et son compte.
   *
   * 🔴 Tout le fonds, pas la page : la bande de l'écran dérivait ses mots des
   * images chargées, et un mot porté hors de la page n'existait pas pour elle.
   */
  @Get("tags")
  async tags(): Promise<readonly MediaTagView[]> {
    return this.queries.execute<ListMediaTagsQuery, readonly MediaTagView[]>(
      new ListMediaTagsQuery(),
    );
  }

  /**
   * Renomme un mot-clé partout — une fusion si le nouveau mot existe déjà.
   *
   * Rend 204 et rien d'autre (CQRS) : l'écran relit `GET /media/tags`.
   */
  @Put("tags/rename")
  @HttpCode(204)
  async renameTag(@Body() body: unknown): Promise<void> {
    const payload = renameMediaTagPayloadSchema.parse(body);
    await this.commands.execute<RenameMediaTagCommand, void>(
      new RenameMediaTagCommand(payload.from, payload.to),
    );
  }

  /**
   * Retire un mot-clé de toutes les images. Le mot en paramètre de requête,
   * comme l'URL de `DELETE /media` : un mot libre peut contenir une `/`.
   */
  @Delete("tags")
  @HttpCode(204)
  async removeTag(@Query("tag") tag?: string): Promise<void> {
    await this.commands.execute<RemoveMediaTagCommand, void>(new RemoveMediaTagCommand(tag ?? ""));
  }

  /**
   * Nomme, tague et pointe une image.
   *
   * 🔴 La clé est l'**URL** dans le corps, et non un identifiant dans le
   * chemin : c'est l'URL que tous les porteurs citent, et c'est elle
   * l'identité de l'image.
   *
   * Le contrôleur ne valide que la FORME (Zod). Ce qu'est un tag acceptable —
   * découpé, en minuscules, dédoublonné, borné — est une règle du domaine, et
   * elle vit dans `mediaTags`.
   */
  @Put()
  async describe(@Body() body: unknown): Promise<void> {
    const payload = mediaDetailsPayloadSchema.parse(body);
    await this.commands.execute<SaveMediaDetailsCommand, void>(
      new SaveMediaDetailsCommand(
        payload.url,
        payload.name,
        payload.tags,
        payload.alt ?? {},
        payload.focal,
      ),
    );
  }

  /**
   * Retire une image de la bibliothèque — octets compris.
   *
   * 🔴 **Refusé en 409 si un porteur l'affiche**, avec leur NOMBRE dans le
   * message. Aucune clé étrangère ne traverse : ce refus est le seul gardien.
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
    return this.commands.execute<DepositImageCommand, DepositImageResult>(
      // Le nom de fichier ne sert PAS au dépôt — la clé est le SHA-256 du
      // contenu. Il sert au refus : sur un lot de cinquante, « lequel n'est
      // pas passé » n'a de réponse que par lui.
      new DepositImageCommand(file.buffer, file.originalname),
    );
  }
}

/** Ce que l'écran demande par défaut à l'historique des refus. */
const DEFAULT_FAILURES_PAGE = 50;

function numberOr(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
