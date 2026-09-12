import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import {
  assignCreditorIdentifierPayloadSchema,
  correctLegalEntityPayloadSchema,
  declareLegalEntityPayloadSchema,
  setCreditorAccountPayloadSchema,
  setPreNotificationPayloadSchema,
  type AssignCreditorIdentifierPayload,
  type CorrectLegalEntityPayload,
  type CreatedIdResponse,
  type DeclareLegalEntityPayload,
  type LegalEntityView,
  type SetCreditorAccountPayload,
  type SetPreNotificationPayload,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AssignCreditorIdentifierCommand,
  CorrectLegalEntityCommand,
  DeclareLegalEntityCommand,
  SetCreditorAccountCommand,
  RemoveLegalEntityLogoCommand,
  SetLegalEntityArchivedCommand,
  SetLegalEntityLogoCommand,
  SetPreNotificationCommand,
} from "../application/commands/legal-entity-commands.js";
import type { LegalEntityLogo } from "../application/queries/get-legal-entity-logo.handler.js";
import type { SampleMandatePdf } from "../application/queries/export-sample-mandate.handler.js";
import {
  ExportSampleMandateQuery,
  GetLegalEntityLogoQuery,
  GetLegalEntityQuery,
  ListLegalEntitiesQuery,
} from "../application/queries/legal-entity-queries.js";
import {
  EntityLogoNotFoundError,
  InvalidEntityLogoError,
} from "../domain/errors/accounting-errors.js";

/**
 * Surface **staff** des entités juridiques émettrices.
 *
 * Staff-only sans jumeau client, et pas par oubli : un client n'a aucune raison
 * d'interroger notre identité d'émetteur autrement qu'en lisant le document
 * qu'on lui envoie, où elle est **figée**. Une route qui la résoudrait à la
 * demande contredirait la copie.
 *
 * Trois gestes ont leur propre route au lieu d'être des champs de la correction,
 * et c'est le même motif chaque fois : **ranger un geste sans retour parmi cinq
 * champs qui se corrigent tous les jours est la meilleure façon de le faire
 * poser par mégarde.** L'ICS ne se remplace pas ; le compte décide d'où l'argent
 * arrive ; le délai est une clause négociée avec la banque.
 */
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

@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminLegalEntitiesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  async list(): Promise<readonly LegalEntityView[]> {
    return this.queries.execute<ListLegalEntitiesQuery, readonly LegalEntityView[]>(
      new ListLegalEntitiesQuery(),
    );
  }

  @Get(":id")
  async one(@Param("id") id: string): Promise<LegalEntityView> {
    return this.queries.execute<GetLegalEntityQuery, LegalEntityView>(new GetLegalEntityQuery(id));
  }

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

  /**
   * Déclare une entité — sans ICS ni compte, qui arrivent après.
   *
   * Rend l'identifiant seul, jamais la vue : une écriture ne rend pas un modèle
   * de lecture, l'appelant relit. Ce n'est pas une cérémonie — c'est ce qui
   * garantit que l'écran affiche ce que la base porte, et pas ce que le handler
   * croyait écrire.
   */
  @Post()
  async declare(
    @Body(new ZodBody(declareLegalEntityPayloadSchema)) payload: DeclareLegalEntityPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<DeclareLegalEntityCommand, string>(
      new DeclareLegalEntityCommand(payload),
    );
    return { id };
  }

  /** Corrige l'identité et l'adresse. Les documents déjà émis en ont pris copie. */
  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async correct(
    @Param("id") id: string,
    @Body(new ZodBody(correctLegalEntityPayloadSchema)) payload: CorrectLegalEntityPayload,
  ): Promise<void> {
    await this.commands.execute(new CorrectLegalEntityCommand(id, payload));
  }

  /**
   * Attribue l'ICS. **Irréversible** — l'agrégat refuse d'en poser un second, et
   * répond 409 en nommant celui qui est déjà en place.
   */
  @Put(":id/creditor-identifier")
  @HttpCode(HttpStatus.NO_CONTENT)
  async assignIcs(
    @Param("id") id: string,
    @Body(new ZodBody(assignCreditorIdentifierPayloadSchema))
    payload: AssignCreditorIdentifierPayload,
  ): Promise<void> {
    await this.commands.execute(new AssignCreditorIdentifierCommand(id, payload.ics));
  }

  /**
   * Enregistre le compte où l'argent arrive.
   *
   * L'IBAN monte ici en clair — le seul endroit du système — et ne redescend
   * par aucune route : `LegalEntityView` n'en porte que quatre caractères.
   */
  @Put(":id/creditor-account")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setAccount(
    @Param("id") id: string,
    @Body(new ZodBody(setCreditorAccountPayloadSchema)) payload: SetCreditorAccountPayload,
  ): Promise<void> {
    await this.commands.execute(new SetCreditorAccountCommand(id, payload.iban));
  }

  @Put(":id/pre-notification")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPreNotification(
    @Param("id") id: string,
    @Body(new ZodBody(setPreNotificationPayloadSchema)) payload: SetPreNotificationPayload,
  ): Promise<void> {
    await this.commands.execute(new SetPreNotificationCommand(id, payload.days));
  }

  /**
   * Archive — **pas de suppression**. Une entité citée par un mandat signé ou une
   * facture émise ne s'efface pas : le document garde son identifiant, et un
   * `DELETE` transformerait une référence en trou.
   */
  @Put(":id/archived")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setArchived(@Param("id") id: string, @Body("archived") archived: boolean): Promise<void> {
    await this.commands.execute(new SetLegalEntityArchivedCommand(id, archived === true));
  }
}
