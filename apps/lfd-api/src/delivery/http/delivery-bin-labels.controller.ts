import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Param, Query, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import { z } from "zod";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import type { BinLabelsFile } from "../application/bin-labels-print.js";
import { GetOrderBinLabelsPdfQuery } from "../application/queries/get-order-bin-labels-pdf.query.js";
import { GetTransferBinLabelsPdfQuery } from "../application/queries/get-transfer-bin-labels-pdf.query.js";

/** `?order=…&bacs=b1,b2` — validés dans leur FORME. */
const orderLabelsQuerySchema = z.object({
  order: z.string().trim().min(1, "order requis (identifiant de la commande)"),
  bacs: z.string().optional(),
});
type OrderLabelsQuery = z.infer<typeof orderLabelsQuerySchema>;

const transferLabelsQuerySchema = z.object({ bacs: z.string().optional() });
type TransferLabelsQuery = z.infer<typeof transferLabelsQuerySchema>;

/**
 * **Les étiquettes des bacs, en PDF A6** (2026-10-25, Hugo : « imprimer
 * l'étiquette devrait donner un beau PDF, là on est sur une capture
 * d'écran ») — une étiquette par feuille, toutes ou celles de `?bacs=`.
 * Servies en ligne : le navigateur les ouvre et les imprime.
 *
 * Les mêmes droits que les lectures qu'elles remplacent à l'écran : les bacs
 * d'une commande sous `production_packing:write` OU `delivery_loading:write`
 * (le panneau du geste, plan des droits par geste §5.3, comme
 * `DeliveryBinsController.orderBins`) ; ceux d'un transfert sous
 * `delivery_loading:read` (comme `DeliveryLoadingController.transferBins`).
 * Il n'injecte que le `QueryBus`.
 */
@Controller("admin/delivery/packing/bin-labels")
@AdminSurface("delivery_loading")
export class DeliveryBinLabelsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequireAnyPermission("production_packing:write", "delivery_loading:write")
  async ofOrder(
    @Query(new ZodQuery(orderLabelsQuerySchema)) query: OrderLabelsQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetOrderBinLabelsPdfQuery, BinLabelsFile>(
      new GetOrderBinLabelsPdfQuery(query.order, idsOf(query.bacs)),
    );
    return served(response, pdf);
  }

  @Get("transfers/:transferId")
  async ofTransfer(
    @Param("transferId") transferId: string,
    @Query(new ZodQuery(transferLabelsQuerySchema)) query: TransferLabelsQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetTransferBinLabelsPdfQuery, BinLabelsFile>(
      new GetTransferBinLabelsPdfQuery(transferId, idsOf(query.bacs)),
    );
    return served(response, pdf);
  }
}

function idsOf(list: string | undefined): readonly string[] {
  return (list ?? "").split(",").filter((id) => id !== "");
}

function served(response: Response, pdf: BinLabelsFile): StreamableFile {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    contentDispositionInline(sanitiseFileName(pdf.fileName, "etiquettes-bacs.pdf")),
  );
  return new StreamableFile(pdf.bytes);
}
