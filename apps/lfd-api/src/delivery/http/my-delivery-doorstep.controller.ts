import {
  type CloseStopWithoutHandoverPayload,
  closeStopWithoutHandoverPayloadSchema,
  type DepositStopFields,
  depositStopFieldsSchema,
  type HandOverStopFields,
  handOverStopFieldsSchema,
  type ReportDeliveryIncidentFields,
  reportDeliveryIncidentFieldsSchema,
  type ReportedDeliveryIncidentResponse,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import type { StoredDocument } from "../../platform/storage/document-store.js";
import { CloseStopWithoutHandoverCommand } from "../application/commands/close-stop-without-handover.command.js";
import { DeclareStopArrivalCommand } from "../application/commands/declare-stop-arrival.command.js";
import { DepositStopCommand } from "../application/commands/deposit-stop.command.js";
import { HandOverStopCommand } from "../application/commands/hand-over-stop.command.js";
import { ReportDeliveryIncidentCommand } from "../application/commands/report-delivery-incident.command.js";
import { ReturnMyRoundCommand } from "../application/commands/return-my-round.command.js";
import { GetMyIncidentPhotoQuery } from "../application/queries/get-my-incident-photo.query.js";
import {
  handoverPicturesUpload,
  incidentPhotoUpload,
  type UploadedHandoverPictures,
  type UploadedIncidentPhoto,
} from "./incident-photo-http.js";
import { serveStepPhoto } from "./step-photo-http.js";

/**
 * **À la porte — les gestes du livreur** (`documentation/livraisons/plan-a-la-porte.md`,
 * lot A).
 *
 * Sous `delivery_doorstep` (AP-D9) : conduire sa tournée et attester ce qui se
 * passe à la porte sont deux gestes. Le MÊME mur que « Ma tournée » : le
 * livreur n'est jamais un paramètre d'URL — c'est la fiche de la requête, et
 * elle entre dans le `where` de chaque lecture et de chaque verrou. Une tournée
 * d'un autre rend 404. Il n'injecte que les bus.
 */
@Controller("admin/livraison/ma-tournee")
@AdminSurface("delivery_doorstep")
export class MyDeliveryDoorstepController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** « Je suis arrivé » — 204, même rejoué. */
  @Post(":roundId/arrets/:stopId/arrivee")
  @HttpCode(HttpStatus.NO_CONTENT)
  async arrive(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Param("stopId") stopId: string,
  ): Promise<void> {
    await this.commands.execute<DeclareStopArrivalCommand, void>(
      new DeclareStopArrivalCommand(staffUserId, roundId, stopId),
    );
  }

  /** « Déclarer un problème » — multipart, la photo facultative. */
  @Post(":roundId/incidents")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(incidentPhotoUpload())
  async report(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Body(new ZodBody(reportDeliveryIncidentFieldsSchema)) fields: ReportDeliveryIncidentFields,
    @UploadedFile() photo: UploadedIncidentPhoto | undefined,
  ): Promise<ReportedDeliveryIncidentResponse> {
    const id = await this.commands.execute<ReportDeliveryIncidentCommand, string>(
      new ReportDeliveryIncidentCommand(staffUserId, roundId, fields, photo?.buffer ?? null),
    );
    return { id };
  }

  /** Clore l'arrêt sans remise — la commande est déjà retirée, ou annulée. 204, même rejoué. */
  @Post(":roundId/arrets/:stopId/cloture-sans-remise")
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeWithoutHandover(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Param("stopId") stopId: string,
    @Body(new ZodBody(closeStopWithoutHandoverPayloadSchema))
    payload: CloseStopWithoutHandoverPayload,
  ): Promise<void> {
    await this.commands.execute<CloseStopWithoutHandoverCommand, void>(
      new CloseStopWithoutHandoverCommand(staffUserId, roundId, stopId, payload),
    );
  }

  /**
   * « Remis au client » (B1) — multipart : le nom et la version, la photo
   * (toujours), la signature (quand l'arrêt l'exige). 204, même rejouée.
   */
  @Post(":roundId/arrets/:stopId/remise")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(handoverPicturesUpload())
  async handOver(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Param("stopId") stopId: string,
    @Body(new ZodBody(handOverStopFieldsSchema)) fields: HandOverStopFields,
    @UploadedFiles() pictures: UploadedHandoverPictures | undefined,
  ): Promise<void> {
    await this.commands.execute<HandOverStopCommand, void>(
      new HandOverStopCommand(
        staffUserId,
        roundId,
        stopId,
        fields,
        pictures?.photo?.[0]?.buffer ?? null,
        pictures?.signature?.[0]?.buffer ?? null,
      ),
    );
  }

  /**
   * « Déposé avec preuve » (B2) — multipart : la version, la photo (toujours).
   * Refusé si l'arrêt ne l'autorise pas (dépôt non autorisé au départ, ou
   * signature exigée). 204, même rejoué.
   */
  @Post(":roundId/arrets/:stopId/depot")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(incidentPhotoUpload())
  async deposit(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Param("stopId") stopId: string,
    @Body(new ZodBody(depositStopFieldsSchema)) fields: DepositStopFields,
    @UploadedFile() photo: UploadedIncidentPhoto | undefined,
  ): Promise<void> {
    await this.commands.execute<DepositStopCommand, void>(
      new DepositStopCommand(staffUserId, roundId, stopId, fields, photo?.buffer ?? null),
    );
  }

  /**
   * « Tournée terminée » (`parcours-du-livreur.md`, PL2) — les bacs vides sont
   * rentrés. 204, même rejoué.
   */
  @Post(":roundId/retour")
  @HttpCode(HttpStatus.NO_CONTENT)
  async returnToDepot(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
  ): Promise<void> {
    await this.commands.execute<ReturnMyRoundCommand, void>(
      new ReturnMyRoundCommand(staffUserId, roundId),
    );
  }

  /** La photo d'un signalement de MA tournée. */
  @Get(":roundId/incidents/:incidentId/photo")
  async incidentPhoto(
    @StaffUserId() staffUserId: string,
    @Param("roundId") roundId: string,
    @Param("incidentId") incidentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetMyIncidentPhotoQuery, StoredDocument>(
      new GetMyIncidentPhotoQuery(staffUserId, roundId, incidentId),
    );
    return serveStepPhoto(res, photo);
  }
}
