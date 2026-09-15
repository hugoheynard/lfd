import {
  type CreatedDeliveryStepResponse,
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
import {
  AddDeliveryStepByStaffCommand,
  RemoveDeliveryStepByStaffCommand,
  ReorderDeliveryStepsByStaffCommand,
  ReviseDeliveryStepByStaffCommand,
} from "../application/commands/admin-delivery-procedure-commands.js";
import type { DeliveryStepPhotoDownload } from "../application/queries/delivery-procedure-reading.js";
import { GetDeliveryProcedureForStaffQuery } from "../application/queries/get-delivery-procedure-for-staff.query.js";
import { GetDeliveryStepPhotoForStaffQuery } from "../application/queries/get-delivery-step-photo-for-staff.query.js";
import {
  photoBytesOf,
  photoUpload,
  servePhoto,
  type UploadedPhotoPart,
} from "../../shared/photo-cards/http/photo-card-http.js";
import { DELIVERY_STEP_UPLOAD_HARD_LIMIT } from "./delivery-procedure-http.js";

const PROCEDURE = ":companyId/delivery-addresses/:addressId/procedure";

/**
 * **La procédure de livraison** d'une adresse, côté staff.
 *
 * Mêmes chemins que la surface client sous `admin/companies`, même préfixe et
 * même ressource que {@link AdminCompanyPiecesController} (`b2b_companies`) :
 * c'est un geste sur les adresses d'un client. Aucun mur membership ; chaque
 * écriture inscrit son fait au journal, dans sa transaction.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
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

  @Post(`${PROCEDURE}/steps`)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(photoUpload(DELIVERY_STEP_UPLOAD_HARD_LIMIT))
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
  @UseInterceptors(photoUpload(DELIVERY_STEP_UPLOAD_HARD_LIMIT))
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
