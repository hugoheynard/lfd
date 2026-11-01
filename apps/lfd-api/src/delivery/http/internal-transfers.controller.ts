import type { DayInternalTransfersView, InternalTransferManifestView } from "@lfd/contracts";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDayInternalTransfersQuery } from "../application/queries/get-day-internal-transfers.query.js";
import { GetInternalTransferManifestQuery } from "../application/queries/get-internal-transfer-manifest.query.js";

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const dayQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "day attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * **Les transferts internes** — Livraison → Tournées (plan du transfert
 * interne, lot T1). Sous `delivery_rounds`, le droit de la composition : un
 * transfert est un arrêt de tournée. Il n'injecte que le bus.
 *
 * Depuis le 2026-11-01 (Hugo : « dans colisage il faudrait que je voie le
 * transfert avec son manifeste »), les deux LECTURES s'ouvrent aussi à qui
 * ouvre le poste de colisage (`production_packing:read`) et à la Supervision
 * (`b2b_supervision:read`) — voir n'est pas composer : aucune écriture ici.
 */
@Controller("admin/delivery/transfers")
@AdminSurface("delivery_rounds")
export class InternalTransfersController {
  constructor(private readonly queries: QueryBus) {}

  /** Les transferts du jour, de quoi ouvrir le manifeste depuis l'encadré d'un site. */
  @Get()
  @RequireAnyPermission("delivery_rounds:read", "production_packing:read", "b2b_supervision:read")
  day(@Query(new ZodQuery(dayQuerySchema)) query: DayQuery): Promise<DayInternalTransfersView> {
    return this.queries.execute<GetDayInternalTransfersQuery, DayInternalTransfersView>(
      new GetDayInternalTransfersQuery(query.day),
    );
  }

  /** Ce que le transfert transporte : calculé s'il est prévu, figé s'il est parti. */
  @Get(":transferId/manifest")
  @RequireAnyPermission("delivery_rounds:read", "production_packing:read", "b2b_supervision:read")
  manifest(@Param("transferId") transferId: string): Promise<InternalTransferManifestView> {
    return this.queries.execute<GetInternalTransferManifestQuery, InternalTransferManifestView>(
      new GetInternalTransferManifestQuery(transferId),
    );
  }
}
