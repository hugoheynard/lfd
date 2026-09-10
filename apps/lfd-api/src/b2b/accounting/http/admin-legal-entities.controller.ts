import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
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
  SetLegalEntityArchivedCommand,
  SetPreNotificationCommand,
} from "../application/commands/legal-entity-commands.js";
import type { SampleMandatePdf } from "../application/queries/export-sample-mandate.handler.js";
import {
  ExportSampleMandateQuery,
  GetLegalEntityQuery,
  ListLegalEntitiesQuery,
} from "../application/queries/legal-entity-queries.js";

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
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<ExportSampleMandateQuery, SampleMandatePdf>(
      new ExportSampleMandateQuery(id),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(pdf.fileName, "mandat-sepa-exemple.pdf")),
    );
    return new StreamableFile(pdf.bytes);
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
