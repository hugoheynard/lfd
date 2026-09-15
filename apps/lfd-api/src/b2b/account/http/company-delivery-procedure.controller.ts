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

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AddDeliveryStepCommand,
  RemoveDeliveryStepCommand,
  ReorderDeliveryStepsCommand,
  ReviseDeliveryStepCommand,
} from "../application/commands/delivery-procedure-commands.js";
import type { DeliveryStepPhotoDownload } from "../application/queries/delivery-procedure-reading.js";
import { GetDeliveryProcedureQuery } from "../application/queries/get-delivery-procedure.query.js";
import { GetDeliveryStepPhotoQuery } from "../application/queries/get-delivery-step-photo.query.js";
import {
  photoBytesOf,
  photoUpload,
  servePhoto,
  type UploadedPhotoPart,
} from "../../shared/photo-cards/http/photo-card-http.js";
import { DELIVERY_STEP_UPLOAD_HARD_LIMIT } from "./delivery-procedure-http.js";

const PROCEDURE = ":companyId/delivery-addresses/:addressId/procedure";

/**
 * **La procédure de livraison** d'une adresse, côté client.
 *
 * Murée comme les adresses : lecture pour tout membre, écriture pour le
 * gestionnaire — le mur vit dans les handlers. Le contrôleur ne fait que le
 * transport : multipart en entrée (champs validés en forme par le contrat,
 * fichier `photo` facultatif), image en sortie.
 */
@Controller("companies")
export class CompanyDeliveryProcedureController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La procédure de l'adresse ; `steps` vide sans procédure (membre). */
  @Get(PROCEDURE)
  async read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
  ): Promise<DeliveryProcedureView> {
    return this.queries.execute<GetDeliveryProcedureQuery, DeliveryProcedureView>(
      new GetDeliveryProcedureQuery(user.userId, companyId, addressId),
    );
  }

  /** Ajoute une étape en fin de procédure (gestionnaire). */
  @Post(`${PROCEDURE}/steps`)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(photoUpload(DELIVERY_STEP_UPLOAD_HARD_LIMIT))
  async addStep(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryStepFieldsSchema)) fields: DeliveryStepFields,
    @UploadedFile() photo: UploadedPhotoPart | undefined,
  ): Promise<CreatedDeliveryStepResponse> {
    const id = await this.commands.execute<AddDeliveryStepCommand, string>(
      new AddDeliveryStepCommand(user.userId, companyId, addressId, fields, photoBytesOf(photo)),
    );
    return { id };
  }

  /** Refait une étape : titre, texte, photo remplacée ou retirée (gestionnaire). */
  @Patch(`${PROCEDURE}/steps/:stepId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(photoUpload(DELIVERY_STEP_UPLOAD_HARD_LIMIT))
  async reviseStep(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Param("stepId") stepId: string,
    @Body(new ZodBody(deliveryStepRevisionFieldsSchema)) fields: DeliveryStepRevisionFields,
    @UploadedFile() photo: UploadedPhotoPart | undefined,
  ): Promise<void> {
    await this.commands.execute<ReviseDeliveryStepCommand, void>(
      new ReviseDeliveryStepCommand(
        user.userId,
        companyId,
        addressId,
        stepId,
        { title: fields.title, body: fields.body },
        fields.removePhoto === "true",
        photoBytesOf(photo),
      ),
    );
  }

  /** Supprime définitivement une étape (gestionnaire). */
  @Delete(`${PROCEDURE}/steps/:stepId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStep(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Param("stepId") stepId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveDeliveryStepCommand, void>(
      new RemoveDeliveryStepCommand(user.userId, companyId, addressId, stepId),
    );
  }

  /** Range les étapes dans un nouvel ordre (gestionnaire). */
  @Put(`${PROCEDURE}/order`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Body(new ZodBody(deliveryProcedureOrderPayloadSchema)) payload: DeliveryProcedureOrderPayload,
  ): Promise<void> {
    await this.commands.execute<ReorderDeliveryStepsCommand, void>(
      new ReorderDeliveryStepsCommand(user.userId, companyId, addressId, payload.stepIds),
    );
  }

  /** Sert la photo d'une étape ; 404 sans photo (membre). */
  @Get(`${PROCEDURE}/steps/:stepId/photo`)
  async photo(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("addressId") addressId: string,
    @Param("stepId") stepId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetDeliveryStepPhotoQuery, DeliveryStepPhotoDownload>(
      new GetDeliveryStepPhotoQuery(user.userId, companyId, addressId, stepId),
    );
    return servePhoto(res, photo);
  }
}
