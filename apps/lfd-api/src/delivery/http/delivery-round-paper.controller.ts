import { hasStaffPermission, type StaffPermission } from "@lfd/contracts";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions } from "../../platform/auth/staff.decorator.js";
import type { RoundPaperFile } from "../application/queries/get-round-paper-pdf.handler.js";
import { GetRoundPaperPdfQuery } from "../application/queries/get-round-paper-pdf.query.js";

/**
 * **La feuille de tournée en PDF** — Livraison → Tournées, « Imprimer ».
 *
 * Même surface que la composition (`delivery_rounds`, lecture) : qui voit la
 * tournée à l'écran peut la tirer. La procédure de livraison relève de
 * `delivery_procedures` (DG-D8) : sans ce droit, le papier part sans étapes,
 * comme la feuille de route. Aucun montant. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/livraison/tournees")
@AdminSurface("delivery_rounds")
export class DeliveryRoundPaperController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":roundId/tournee.pdf")
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
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "tournee.pdf")),
    );
    return new StreamableFile(file.bytes);
  }
}
