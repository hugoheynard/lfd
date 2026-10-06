import {
  type AddressDoorstepRulePayload,
  addressDoorstepRulePayloadSchema,
  type AddressDoorstepRuleView,
  type CreatedDeliveryStepResponse,
  type DeliveryDepositPayload,
  deliveryDepositPayloadSchema,
  type DeliveryProcedureOrderPayload,
  deliveryProcedureOrderPayloadSchema,
  type DeliveryProcedureView,
  type DeliveryStepFields,
  deliveryStepFieldsSchema,
  type DeliveryStepRevisionFields,
  deliveryStepRevisionFieldsSchema,
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
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddDeliveryStepByStaffCommand } from "../application/commands/add-delivery-step-by-staff.command.js";
import { RemoveDeliveryStepByStaffCommand } from "../application/commands/remove-delivery-step-by-staff.command.js";
import { ReorderDeliveryStepsByStaffCommand } from "../application/commands/reorder-delivery-steps-by-staff.command.js";
import { ReviseDeliveryStepByStaffCommand } from "../application/commands/revise-delivery-step-by-staff.command.js";
import type { DeliveryStepPhotoDownload } from "../application/queries/delivery-procedure-reading.js";
import { SetDeliveryDepositByStaffCommand } from "../application/commands/set-delivery-deposit-by-staff.command.js";
import { SetDeliveryDoorstepRuleByStaffCommand } from "../application/commands/set-delivery-doorstep-rule-by-staff.command.js";
import { GetDeliveryDoorstepRuleForStaffQuery } from "../application/queries/get-delivery-doorstep-rule-for-staff.query.js";
import { GetDeliveryProcedureForStaffQuery } from "../application/queries/get-delivery-procedure-for-staff.query.js";
import { GetDeliveryStepPhotoForStaffQuery } from "../application/queries/get-delivery-step-photo-for-staff.query.js";
import {
  photoBytesOf,
  servePhoto,
  type UploadedPhotoPart,
} from "../../shared/photo-cards/http/photo-card-http.js";
import { deliveryStepPhotoUpload } from "./delivery-procedure-http.js";

const PROCEDURE = ":companyId/delivery-addresses/:addressId/procedure";
const DEPOSIT = ":companyId/delivery-addresses/:addressId/deposit";
const DOORSTEP_RULE = ":companyId/delivery-addresses/:addressId/doorstep-rule";

/**
 * **La procédure de livraison** d'une adresse, côté staff.
 *
 * Mêmes chemins que la surface client sous `admin/companies`, même préfixe
 * que {@link AdminCompanyPiecesController} — mais plus sa ressource :
 * `delivery_procedures` depuis le 2026-10-01 (`documentation/livraisons/plan-droits-par-geste.md`, DG-D1).
 * La bascule l'a donnée au même niveau à chaque rôle qui tenait
 * `b2b_companies`. Aucun mur membership ; chaque écriture inscrit son fait au
 * journal, dans sa transaction.
 *
 * Depuis le 2026-10-01, il règle aussi **« dépôt autorisé »** sur l'adresse
 * (`a-la-porte.md`, AP-D5) : le commercial le règle comme la procédure,
 * et la route d'édition de l'adresse — sous `b2b_companies` — ne le touche pas.
 * Et, du même jour, la **décision réglée d'avance à la porte** de l'adresse
 * (B3 bis, LB-Q6) : le commercial seul, le client ne la règle ni ne la lit.
 */
@Controller("admin/companies")
@AdminSurface("delivery_procedures")
export class AdminCompanyDeliveryProcedureController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(PROCEDURE)
  async read(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<DeliveryProcedureView> {
    return this.queries.execute<GetDeliveryProcedureForStaffQuery, DeliveryProcedureView>(
      new GetDeliveryProcedureForStaffQuery(companyId, addressId),
    );
  }

  @Put(DEPOSIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDeposit(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryDepositPayloadSchema)) payload: DeliveryDepositPayload,
  ): Promise<void> {
    await this.commands.execute<SetDeliveryDepositByStaffCommand, void>(
      new SetDeliveryDepositByStaffCommand(companyId, addressId, payload.depositAllowed),
    );
  }

  @Get(DOORSTEP_RULE)
  async readDoorstepRule(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<AddressDoorstepRuleView> {
    return this.queries.execute<GetDeliveryDoorstepRuleForStaffQuery, AddressDoorstepRuleView>(
      new GetDeliveryDoorstepRuleForStaffQuery(companyId, addressId),
    );
  }

  @Put(DOORSTEP_RULE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDoorstepRule(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(addressDoorstepRulePayloadSchema)) payload: AddressDoorstepRulePayload,
  ): Promise<void> {
    await this.commands.execute<SetDeliveryDoorstepRuleByStaffCommand, void>(
      new SetDeliveryDoorstepRuleByStaffCommand(companyId, addressId, payload.rule),
    );
  }

  @Post(`${PROCEDURE}/steps`)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(deliveryStepPhotoUpload())
  async addStep(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryStepFieldsSchema)) fields: DeliveryStepFields,
    @UploadedFile() photo: UploadedPhotoPart | undefined,
  ): Promise<CreatedDeliveryStepResponse> {
    const id = await this.commands.execute<AddDeliveryStepByStaffCommand, string>(
      new AddDeliveryStepByStaffCommand(companyId, addressId, fields, photoBytesOf(photo)),
    );
    return { id };
  }

  @Patch(`${PROCEDURE}/steps/:stepId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(deliveryStepPhotoUpload())
  async reviseStep(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Param("stepId") stepId: string,
    @Body(new ZodBody(deliveryStepRevisionFieldsSchema)) fields: DeliveryStepRevisionFields,
    @UploadedFile() photo: UploadedPhotoPart | undefined,
  ): Promise<void> {
    await this.commands.execute<ReviseDeliveryStepByStaffCommand, void>(
      new ReviseDeliveryStepByStaffCommand(
        companyId,
        addressId,
        stepId,
        { title: fields.title, body: fields.body },
        fields.removePhoto === "true",
        photoBytesOf(photo),
      ),
    );
  }

  @Delete(`${PROCEDURE}/steps/:stepId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStep(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Param("stepId") stepId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveDeliveryStepByStaffCommand, void>(
      new RemoveDeliveryStepByStaffCommand(companyId, addressId, stepId),
    );
  }

  @Put(`${PROCEDURE}/order`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryProcedureOrderPayloadSchema)) payload: DeliveryProcedureOrderPayload,
  ): Promise<void> {
    await this.commands.execute<ReorderDeliveryStepsByStaffCommand, void>(
      new ReorderDeliveryStepsByStaffCommand(companyId, addressId, payload.stepIds),
    );
  }

  @Get(`${PROCEDURE}/steps/:stepId/photo`)
  async photo(
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Param("stepId") stepId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<
      GetDeliveryStepPhotoForStaffQuery,
      DeliveryStepPhotoDownload
    >(new GetDeliveryStepPhotoForStaffQuery(companyId, addressId, stepId));
    return servePhoto(res, photo);
  }
}
