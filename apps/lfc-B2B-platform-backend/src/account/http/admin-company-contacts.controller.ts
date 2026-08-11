import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  AddContactByStaffCommand,
  RemoveContactByStaffCommand,
  UpdateContactByStaffCommand,
  UpdatePrimaryContactByStaffCommand,
} from "../application/commands/admin-contact-commands.js";
import type { CreatedContactResponse } from "./company-contacts.controller.js";
import { contactPayload, type ContactPayload } from "./payloads.js";

/**
 * Contacts d'une société, **côté staff** (Porte B).
 *
 * Jumeau de la surface cliente moins le mur membership : le staff n'est membre
 * de rien, sa porte est `AdminAuthGuard`. Le commercial complète le carnet
 * d'adresses à la place du client — c'est le même geste, depuis l'autre côté du
 * comptoir.
 */
@Controller("admin/companies/:companyId")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminCompanyContactsController {
  constructor(private readonly commands: CommandBus) {}

  /** Édite le **détenteur** du compte (contact principal, aplati sur la société). */
  @Patch("contact")
  async updatePrimary(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(contactPayload)) payload: ContactPayload,
  ): Promise<void> {
    await this.commands.execute<UpdatePrimaryContactByStaffCommand, void>(
      new UpdatePrimaryContactByStaffCommand(companyId, payload),
    );
  }

  @Post("contacts")
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(contactPayload)) payload: ContactPayload,
  ): Promise<CreatedContactResponse> {
    const id = await this.commands.execute<AddContactByStaffCommand, string>(
      new AddContactByStaffCommand(companyId, payload),
    );
    return { id };
  }

  @Patch("contacts/:contactId")
  async update(
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
    @Body(new ZodBody(contactPayload)) payload: ContactPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateContactByStaffCommand, void>(
      new UpdateContactByStaffCommand(companyId, contactId, payload),
    );
  }

  @Delete("contacts/:contactId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveContactByStaffCommand, void>(
      new RemoveContactByStaffCommand(companyId, contactId),
    );
  }
}
