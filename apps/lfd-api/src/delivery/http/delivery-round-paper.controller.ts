import { hasStaffPermission, type StaffPermission } from "@lfd/contracts";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions } from "../../platform/auth/staff.decorator.js";
import type { RoundPaperFile } from "../application/queries/get-round-paper-pdf.handler.js";
import { GetRoundPaperPdfQuery } from "../application/queries/get-round-paper-pdf.query.js";
import { GetDayRoundsDossierPdfQuery } from "../application/queries/get-day-rounds-dossier-pdf.query.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";

/** Le jour de service en chemin, validé dans sa FORME — le message nomme le format. */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

/**
 * **La feuille de tournée en PDF** — Livraison → Tournées, « Imprimer ».
 *
 * Même surface que la composition (`delivery_rounds`, lecture) : qui voit la
 * tournée à l'écran peut la tirer. La procédure de livraison relève de
 * `delivery_procedures` (DG-D8) : sans ce droit, le papier part sans étapes,
 * comme la feuille de route. Aucun montant. Il n'injecte que le `QueryBus`.
 *
 * Le **dossier des tournées du jour** (décision de Hugo du 2026-10-26) est
 * servi ici, sous le même droit : il n'est fait que de ces feuilles et de la
 * répartition qui les ordonne.
 */
@Controller("admin/delivery/rounds")
@AdminSurface("delivery_rounds")
export class DeliveryRoundPaperController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":roundId/round.pdf")
  async paper(
    @Param("roundId") roundId: string,
    @StaffPermissions() permissions: readonly StaffPermission[],
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.queries.execute<GetRoundPaperPdfQuery, RoundPaperFile>(
      new GetRoundPaperPdfQuery(
        roundId,
        hasStaffPermission(permissions, "delivery_procedures:read"),
      ),
    );
    return servePdf(response, file, "tournee.pdf");
  }

  @Get("day/:day/dossier.pdf")
  async dossier(
    @Param("day", new ZodQuery(daySchema)) day: string,
    @StaffPermissions() permissions: readonly StaffPermission[],
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.queries.execute<GetDayRoundsDossierPdfQuery, RoundPaperFile>(
      new GetDayRoundsDossierPdfQuery(
        day,
        hasStaffPermission(permissions, "delivery_procedures:read"),
      ),
    );
    return servePdf(response, file, "dossier-de-livraison.pdf");
  }
}

/** Les en-têtes d'un papier à télécharger, et ses octets. */
function servePdf(response: Response, file: RoundPaperFile, fallback: string): StreamableFile {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    contentDispositionAttachment(sanitiseFileName(file.fileName, fallback)),
  );
  return new StreamableFile(file.bytes);
}
