import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  contentDispositionAttachment,
  contentDispositionInline,
  sanitiseFileName,
} from "@lfd/storage";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  RemoveLegalEntityLogoCommand,
  SetLegalEntityLogoCommand,
} from "../application/commands/legal-entity-commands.js";
import type { LegalEntityLogo } from "../application/queries/get-legal-entity-logo.handler.js";
import type { SampleMandatePdf } from "../application/queries/export-sample-mandate.handler.js";
import {
  ExportSampleMandateQuery,
  GetLegalEntityLogoQuery,
} from "../application/queries/legal-entity-queries.js";
import {
  EntityLogoNotFoundError,
  InvalidEntityLogoError,
} from "../domain/errors/accounting-errors.js";

/**
 * Backstop DoS du multipart, aligné sur le dépôt du KBIS : le domaine tranche
 * bien plus bas (2 Mo), et c'est lui qui porte la règle. Cette borne-ci ne
 * protège que le processus contre un corps qu'on n'a aucune raison de lire.
 */
const LOGO_UPLOAD_HARD_LIMIT = 8 * 1024 * 1024;

/** Le peu qu'on lit du fichier Multer — nom + octets ; le domaine valide le reste. */
interface UploadedFilePart {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/**
 * **Ce qui sort en octets** — le logo de l'entité, et la fiche de mandat SEPA.
 *
 * Séparée du registre parce qu'elle n'a pas la même raison de changer : ici on
 * manipule du multipart, des `Content-Disposition`, un `StreamableFile` et la
 * `Response` d'Express. Rien de cela ne bouge quand une mention légale change,
 * et inversement — mêlés, les deux se relisaient ensemble sans jamais se
 * concerner.
 *
 * 🔴 **Le partage `inline` / `attachment` est le sujet de ce fichier**, et c'est
 * une frontière de sécurité : `inline` rend le contenu DANS notre origine, donc
 * un `.svg` ou un `.html` téléversé y deviendrait un XSS stocké. Les deux
 * routes qui l'emploient s'en autorisent pour deux raisons distinctes, écrites
 * à côté de chacune. Les garder voisines fait qu'on ne peut plus en ajouter une
 * troisième sans lire les deux premières.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminLegalEntityDocumentsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * La fiche de mandat SEPA préremplie de notre bloc créancier — un **exemple**,
   * sans débiteur ni RUM.
   *
   * `GET` et non `POST` : rien n'est créé. Deux appels rendent le même fichier au
   * bit près, et aucun mandat n'existe à l'issue. Le jour où un mandat nominatif
   * sera émis, ce sera une commande — frapper une RUM est un fait qu'on garde.
   *
   * Répond **409** si l'entité ne peut pas encaisser, en nommant ce qui manque :
   * c'est `creditorSnapshot()` qui refuse, et il refuse plutôt que de rendre des
   * chaînes vides qu'un gabarit imprimerait sans broncher.
   */
  @Get(":id/mandat-sepa-exemple.pdf")
  async sampleMandate(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
    @Query("inline") inline?: string,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<ExportSampleMandateQuery, SampleMandatePdf>(
      new ExportSampleMandateQuery(id),
    );
    const fileName = sanitiseFileName(pdf.fileName, "mandat-sepa-exemple.pdf");
    response.setHeader("Content-Type", "application/pdf");
    // Deux gestes, une seule route : l'écran veut REGARDER la fiche avant de
    // l'imprimer, et accumuler des PDF dans un dossier de téléchargements pour
    // vérifier une adresse est le contraire d'un contrôle.
    //
    // La bascule attend `1` EXACTEMENT, et le défaut est l'enregistrement. Tester
    // la seule présence du paramètre ferait de `?inline=0` un affichage — un
    // drapeau qui dit oui quand on écrit non est pire que pas de drapeau.
    //
    // 🔴 `inline` n'est légitime que parce que ces octets sont fabriqués ICI :
    // un PDF rendu par un service de domaine, dont nous choisissons le type. Le
    // helper le dit — jamais sur du contenu téléversé, où « inline » rend un
    // `.svg` dans notre origine, c'est-à-dire un XSS stocké.
    response.setHeader(
      "Content-Disposition",
      inline === "1" ? contentDispositionInline(fileName) : contentDispositionAttachment(fileName),
    );
    return new StreamableFile(pdf.bytes);
  }

  /**
   * Sert le **logo courant** de l'entité, pour que l'écran l'affiche.
   *
   * `inline`, et c'est ici que le helper met en garde : « jamais sur du contenu
   * téléversé », parce qu'un `.svg` ou un `.html` rendu dans notre origine est un
   * XSS stocké. La garde n'est pas un jugement sur la provenance, c'est le
   * `Content-Type` : il est **relu dans les octets** par le domaine, et seuls
   * `image/png` et `image/jpeg` peuvent en sortir. Un navigateur ne script ni
   * l'un ni l'autre. Servir en `attachment` ferait télécharger un fichier là où
   * on veut une vignette dans une fiche.
   */
  @Get(":id/logo")
  async logo(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const logo = await this.queries.execute<GetLegalEntityLogoQuery, LegalEntityLogo | null>(
      new GetLegalEntityLogoQuery(id),
    );
    if (logo === null) {
      throw new EntityLogoNotFoundError(id);
    }
    response.setHeader("Content-Type", logo.contentType);
    // Un nom CONSTANT, jamais celui du dépôt : il n'est pas gardé en base, et le
    // faire circuler pour un affichage en vignette n'apporterait qu'une saisie
    // de plus à assainir.
    response.setHeader("Content-Disposition", contentDispositionInline("logo"));
    return new StreamableFile(logo.bytes);
  }

  /**
   * Dépose (ou remplace) le logo. Multipart `file` ; **le domaine valide les
   * octets** — format reconnu à la tête du fichier, taille, côté minimum,
   * quasi-quadrature.
   *
   * Le contrôleur ne revalide rien de tout cela : il constate seulement qu'un
   * fichier est arrivé. Le `mimetype` annoncé par le navigateur n'est même pas
   * lu — il se falsifie d'un champ de formulaire.
   */
  @Post(":id/logo")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LOGO_UPLOAD_HARD_LIMIT } }))
  async setLogo(
    @Param("id") id: string,
    @UploadedFile() file: UploadedFilePart | undefined,
  ): Promise<void> {
    if (file === undefined) {
      throw new InvalidEntityLogoError("aucun fichier reçu. Choisissez une image puis réessayez.");
    }
    await this.commands.execute<SetLegalEntityLogoCommand, void>(
      new SetLegalEntityLogoCommand(id, file.originalname, file.buffer),
    );
  }

  /** Retire le logo. Le mandat ressort avec sa cellule vide, et reste valide. */
  @Delete(":id/logo")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLogo(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveLegalEntityLogoCommand, void>(
      new RemoveLegalEntityLogoCommand(id),
    );
  }
}
