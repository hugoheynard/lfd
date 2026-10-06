import type { DeliveryIncidentsDayView, UndeliveredStopsView } from "@lfd/contracts";
import { Controller, Get, Param, Query, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import type { StoredDocument } from "../../platform/storage/document-store.js";
import { GetDeliveryIncidentsDayQuery } from "../application/queries/get-delivery-incidents-day.query.js";
import { GetIncidentPhotoQuery } from "../application/queries/get-incident-photo.query.js";
import { GetUndeliveredStopsQuery } from "../application/queries/get-undelivered-stops.query.js";
import { serveStepPhoto } from "./step-photo-http.js";

/** Le jour, validé dans sa FORME — le message nomme le paramètre. */
const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
type DateQuery = z.infer<typeof dateQuerySchema>;

/**
 * **Les signalements et « Non remis », côté admin**
 * (`documentation/livraisons/a-la-porte.md`, § 3, AP-D7).
 *
 * Sous `delivery_rounds` (lecture seule) : c'est l'écran Tournées qui les
 * montre. « Non remis » est une vue, il ne débloque rien. Il n'injecte que le
 * bus de lecture.
 */
@Controller("admin/livraison")
@AdminSurface("delivery_rounds")
export class DeliveryIncidentsController {
  constructor(private readonly queries: QueryBus) {}

  @Get("incidents")
  ofDay(@Query(new ZodQuery(dateQuerySchema)) query: DateQuery): Promise<DeliveryIncidentsDayView> {
    return this.queries.execute<GetDeliveryIncidentsDayQuery, DeliveryIncidentsDayView>(
      new GetDeliveryIncidentsDayQuery(query.date),
    );
  }

  @Get("non-remis")
  undelivered(): Promise<UndeliveredStopsView> {
    return this.queries.execute<GetUndeliveredStopsQuery, UndeliveredStopsView>(
      new GetUndeliveredStopsQuery(),
    );
  }

  @Get("incidents/:incidentId/photo")
  async photo(
    @Param("incidentId") incidentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetIncidentPhotoQuery, StoredDocument>(
      new GetIncidentPhotoQuery(incidentId),
    );
    return serveStepPhoto(res, photo);
  }
}
