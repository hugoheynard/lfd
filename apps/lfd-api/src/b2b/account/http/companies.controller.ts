import {
  type ActivationGate,
  type UpdateIdentityPayload,
  updateIdentityPayloadSchema,
  type UpdatePaymentTermPayload,
  updatePaymentTermPayloadSchema,
  fulfillmentPreferencePayloadSchema,
  type FulfillmentPreferencePayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PreferFulfillmentCommand,
  RequestPaymentTermCommand,
  UpdateCompanyIdentityCommand,
} from "../application/commands/company-settings-commands.js";
import { CreateCompanyCommand } from "../application/commands/create-company.command.js";
import { GetMyCompanyActivationQuery } from "../application/queries/get-my-company-activation.query.js";
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
 * entreprise existante : **murés gestionnaire** (le handler s'en charge). Le
 * verdict d'activation se lit en **membre**.
 */
@Controller("companies")
export class CompaniesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

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
        payload.siren,
        payload.vatNumber,
      ),
    );
    return { id };
  }

  /**
   * Le verdict d'activation de l'entreprise — membre. Le même que celui du
   * staff, calculé par la même fonction : l'écran client l'affiche, il ne
   * rejoue pas la règle.
   */
  @Get(":companyId/activation")
  async activation(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<ActivationGate> {
    return this.queries.execute<GetMyCompanyActivationQuery, ActivationGate>(
      new GetMyCompanyActivationQuery(user.userId, companyId),
    );
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
