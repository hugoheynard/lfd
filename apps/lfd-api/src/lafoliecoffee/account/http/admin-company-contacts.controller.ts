import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ExpectedRevision } from "./expected-revision.decorator.js";
import { AddContactByStaffCommand } from "../application/commands/add-contact-by-staff.command.js";
import { RemoveContactByStaffCommand } from "../application/commands/remove-contact-by-staff.command.js";
import { UpdateContactByStaffCommand } from "../application/commands/update-contact-by-staff.command.js";
import { UpdatePrimaryContactByStaffCommand } from "../application/commands/update-primary-contact-by-staff.command.js";
import type { CreatedContactResponse } from "./company-contacts.controller.js";
import {
  additionalContactPayload,
  contactPayload,
  type AdditionalContactPayload,
  type ContactPayload,
} from "./payloads.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Contacts d'une société, **côté staff** (Porte B).
 *
 * Jumeau de la surface cliente moins le mur membership : le staff n'est membre
 * de rien, sa porte est `AdminAuthGuard`. Le commercial complète le carnet
 * d'adresses à la place du client — c'est le même geste, depuis l'autre côté du
 * comptoir.
 */
@Controller("admin/companies/:companyId")
@AdminSurface("b2b_companies")
export class AdminCompanyContactsController {
  constructor(private readonly commands: CommandBus) {}

  /** Édite le **détenteur** du compte (contact principal, aplati sur la société). */
  @Patch("contact")
  @Idempotent(
    "pose les coordonnées du détenteur : rejouée, l'agrégat les trouve identiques et rien n'est écrit ni journalisé",
  )
  async updatePrimary(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(contactPayload)) payload: ContactPayload,
    @ExpectedRevision() expectedRevision: number | null,
  ): Promise<void> {
    await this.commands.execute<UpdatePrimaryContactByStaffCommand, void>(
      new UpdatePrimaryContactByStaffCommand(companyId, payload, expectedRevision),
    );
  }

  /** Un contact de plus — une fois par intention (`Idempotency-Key`). */
  @Post("contacts")
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(additionalContactPayload)) payload: AdditionalContactPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<CreatedContactResponse> {
    const id = await this.commands.execute<AddContactByStaffCommand, string>(
      new AddContactByStaffCommand(companyId, payload, payload.role, staffUserId, intentKey),
    );
    return { id };
  }

  @Patch("contacts/:contactId")
  @Idempotent(
    "pose les coordonnées et le rôle d'un contact : rejouée, le carnet les trouve identiques et rien n'est écrit ni journalisé",
  )
  async update(
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
    @Body(new ZodBody(additionalContactPayload)) payload: AdditionalContactPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateContactByStaffCommand, void>(
      new UpdateContactByStaffCommand(companyId, contactId, payload, payload.role),
    );
  }

  @Delete("contacts/:contactId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "retire l'interlocuteur : rejoué, il n'existe plus et le geste est refusé (404), la transaction annule tout",
  )
  async remove(
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveContactByStaffCommand, void>(
      new RemoveContactByStaffCommand(companyId, contactId),
    );
  }
}
