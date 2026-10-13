import type { InternalTransferManifestView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { GetInternalTransferManifestQuery } from "../application/queries/get-internal-transfer-manifest.query.js";

/**
 * **Les transferts internes** — Livraison → Tournées (plan du transfert
 * interne, lot T1). Sous `delivery_rounds`, le droit de la composition : un
 * transfert est un arrêt de tournée. Il n'injecte que le bus.
 */
@Controller("admin/delivery/transfers")
@AdminSurface("delivery_rounds")
export class InternalTransfersController {
  constructor(private readonly queries: QueryBus) {}

  /** Ce que le transfert transporte : calculé s'il est prévu, figé s'il est parti. */
  @Get(":transferId/manifest")
  manifest(@Param("transferId") transferId: string): Promise<InternalTransferManifestView> {
    return this.queries.execute<GetInternalTransferManifestQuery, InternalTransferManifestView>(
      new GetInternalTransferManifestQuery(transferId),
    );
  }
}
