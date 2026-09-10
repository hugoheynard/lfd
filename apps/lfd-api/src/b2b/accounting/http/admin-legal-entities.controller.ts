import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
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
import {
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
