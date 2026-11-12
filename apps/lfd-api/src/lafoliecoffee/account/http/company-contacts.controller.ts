import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AddCompanyContactCommand,
  RemoveCompanyContactCommand,
  UpdateCompanyContactCommand,
  UpdatePrimaryContactCommand,
} from "../application/commands/contact-commands.js";
import {
  additionalContactPayload,
  contactPayload,
  type AdditionalContactPayload,
  type ContactPayload,
} from "./payloads.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/** Ce que l'ajout d'un contact renvoie : son identifiant. */
export interface CreatedContactResponse {
  readonly id: string;
}

/**
 * Contacts d'une entreprise — le contact **principal** (carte « Admin du compte
 * entreprise ») et les contacts **additionnels**.
 *
 * Tous ces endpoints sont **murés** : ils portent l'entreprise dans l'URL, et le
 * handler vérifie que le demandeur en est le gestionnaire (`ensureCompanyAdmin`).
 * L'`userId` vient toujours du `Principal`, jamais du corps — sinon l'acteur
 * serait usurpable. Le contrôleur ne fait que dispatcher au bus.
 */
@Controller("companies")
export class CompanyContactsController {
  constructor(private readonly commands: CommandBus) {}

  /** Édite le contact principal. */
  @Patch(":companyId/contact")
  @Idempotent(
    "pose les coordonnées du détenteur : rejouée, l'agrégat les trouve identiques et rien n'est écrit ni journalisé",
  )
  async updatePrimaryContact(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(contactPayload)) payload: ContactPayload,
  ): Promise<void> {
    await this.commands.execute<UpdatePrimaryContactCommand, void>(
      new UpdatePrimaryContactCommand(user.userId, companyId, payload),
    );
  }

  /** Ajoute un contact additionnel. */
  @Post(":companyId/contacts")
  @HttpCode(HttpStatus.CREATED)
  async addContact(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(additionalContactPayload)) payload: AdditionalContactPayload,
  ): Promise<CreatedContactResponse> {
    const id = await this.commands.execute<AddCompanyContactCommand, string>(
      new AddCompanyContactCommand(user.userId, companyId, payload, payload.role),
    );
    return { id };
  }

  /** Remplace un contact additionnel. */
  @Patch(":companyId/contacts/:contactId")
  @Idempotent(
    "pose les coordonnées et le rôle d'un contact : rejouée, le carnet les trouve identiques et rien n'est écrit ni journalisé",
  )
  async updateContact(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
    @Body(new ZodBody(additionalContactPayload)) payload: AdditionalContactPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateCompanyContactCommand, void>(
      new UpdateCompanyContactCommand(user.userId, companyId, contactId, payload, payload.role),
    );
  }

  /** Retire un contact additionnel. */
  @Delete(":companyId/contacts/:contactId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "retire l'interlocuteur : rejoué, il n'existe plus et le geste est refusé (404), la transaction annule tout",
  )
  async removeContact(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveCompanyContactCommand, void>(
      new RemoveCompanyContactCommand(user.userId, companyId, contactId),
    );
  }
}
