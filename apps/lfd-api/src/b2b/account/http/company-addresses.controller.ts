import {
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type CompanyAddressesView,
  type CreatedAddressResponse,
  type DeliveryAddressPayload,
  deliveryAddressPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AddDeliveryAddressCommand,
  RemoveDeliveryAddressCommand,
  SaveBillingAddressCommand,
  SetDefaultDeliveryAddressCommand,
  UpdateDeliveryAddressCommand,
} from "../application/commands/address-commands.js";
import { ListCompanyAddressesQuery } from "../application/queries/list-company-addresses.query.js";

/**
 * Adresses d'une entreprise — une facturation (unique) et N livraisons (une par
 * défaut, toujours renvoyée en tête).
 *
 * Tous ces endpoints sont **murés** : l'entreprise est dans l'URL, et le handler
 * la vérifie contre les memberships du demandeur. La **lecture** suffit à tout
 * membre (`ensureCompanyMember`) ; les **écritures** sont réservées au
 * gestionnaire (`ensureCompanyAdmin`). L'`userId` vient toujours du `Principal`,
 * jamais du corps. Le contrôleur ne fait que dispatcher au bus.
 */
@Controller("companies")
export class CompanyAddressesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Liste les adresses de l'entreprise (membre). */
  @Get(":companyId/addresses")
  async list(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<CompanyAddressesView> {
    return this.queries.execute<ListCompanyAddressesQuery, CompanyAddressesView>(
      new ListCompanyAddressesQuery(user.userId, companyId),
    );
  }

  /** Enregistre l'adresse de facturation (gestionnaire). */
  @Patch(":companyId/billing-address")
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveBilling(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(billingAddressPayloadSchema)) payload: BillingAddressPayload,
  ): Promise<void> {
    await this.commands.execute<SaveBillingAddressCommand, void>(
      new SaveBillingAddressCommand(user.userId, companyId, payload),
    );
  }

  /** Ajoute une adresse de livraison (gestionnaire). */
  @Post(":companyId/delivery-addresses")
  @HttpCode(HttpStatus.CREATED)
  async addDelivery(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(deliveryAddressPayloadSchema)) payload: DeliveryAddressPayload,
  ): Promise<CreatedAddressResponse> {
    const id = await this.commands.execute<AddDeliveryAddressCommand, string>(
      new AddDeliveryAddressCommand(user.userId, companyId, payload),
    );
    return { id };
  }

  /** Remplace une adresse de livraison (gestionnaire). */
  @Patch(":companyId/delivery-addresses/:addressId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateDelivery(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryAddressPayloadSchema)) payload: DeliveryAddressPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliveryAddressCommand, void>(
      new UpdateDeliveryAddressCommand(user.userId, companyId, addressId, payload),
    );
  }

  /** Archive une adresse de livraison (gestionnaire). */
  @Delete(":companyId/delivery-addresses/:addressId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDelivery(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveDeliveryAddressCommand, void>(
      new RemoveDeliveryAddressCommand(user.userId, companyId, addressId),
    );
  }

  /** Désigne l'adresse de livraison par défaut (gestionnaire). */
  @Patch(":companyId/delivery-addresses/:addressId/default")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDefault(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    await this.commands.execute<SetDefaultDeliveryAddressCommand, void>(
      new SetDefaultDeliveryAddressCommand(user.userId, companyId, addressId),
    );
  }
}
