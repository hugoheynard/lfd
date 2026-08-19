import {
  type UpdateIdentityPayload,
  updateIdentityPayloadSchema,
  type UpdatePaymentTermPayload,
  updatePaymentTermPayloadSchema,
  fulfillmentPreferencePayloadSchema,
  type FulfillmentPreferencePayload,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PreferFulfillmentCommand,
  RequestPaymentTermCommand,
  UpdateCompanyIdentityCommand,
} from "../application/commands/company-settings-commands.js";
import { CreateCompanyCommand } from "../application/commands/create-company.command.js";
import { createCompanyPayload, type CreateCompanyPayload } from "./payloads.js";

/** Ce que la création renvoie : de quoi router, rien de plus. */
export interface CreatedCompanyResponse {
  readonly id: string;
}

/**
 * Le cœur d'une entreprise : sa **création** et ses **réglages** propres
 * (identité souple, condition de règlement). Les sous-ressources (contacts, KBIS,
 * adresses) vivent dans leurs propres contrôleurs. Ce contrôleur ne porte pas de
 * logique : il dispatche au bus.
 *
 * Création : aucune garde de rôle (chacun déclare la sienne). Réglages sur une
 * entreprise existante : **murés gestionnaire** (le handler s'en charge).
 */
@Controller("companies")
export class CompaniesController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(createCompanyPayload)) payload: CreateCompanyPayload,
  ): Promise<CreatedCompanyResponse> {
    const id = await this.commands.execute<CreateCompanyCommand, string>(
      new CreateCompanyCommand(
        user.userId,
        payload.raisonSociale,
        payload.enseigne,
        payload.formeJuridique,
        payload.siret,
        payload.tvaIntracom,
      ),
    );
    return { id };
  }

  /** Édite l'identité souple (enseigne + n° de TVA) — gestionnaire. */
  @Patch(":companyId/identity")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateIdentity(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(updateIdentityPayloadSchema)) payload: UpdateIdentityPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateCompanyIdentityCommand, void>(
      new UpdateCompanyIdentityCommand(user.userId, companyId, payload),
    );
  }

  /**
   * Pose la **préférence d'acheminement** — gestionnaire.
   *
   * Le client la règle lui-même : contrairement aux crédits de règlement, ce
   * n'est pas une faveur à demander, c'est lui qui sait où il veut être servi.
   */
  @Patch(":companyId/fulfillment-preference")
  @HttpCode(HttpStatus.NO_CONTENT)
  async preferFulfillment(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(fulfillmentPreferencePayloadSchema)) payload: FulfillmentPreferencePayload,
  ): Promise<void> {
    await this.commands.execute<PreferFulfillmentCommand, void>(
      new PreferFulfillmentCommand(user.userId, companyId, payload),
    );
  }

  /** Enregistre la condition de règlement **demandée** — gestionnaire. */
  @Patch(":companyId/payment-term")
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPaymentTerm(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(updatePaymentTermPayloadSchema)) payload: UpdatePaymentTermPayload,
  ): Promise<void> {
    await this.commands.execute<RequestPaymentTermCommand, void>(
      new RequestPaymentTermCommand(user.userId, companyId, payload.paymentTerm),
    );
  }
}
