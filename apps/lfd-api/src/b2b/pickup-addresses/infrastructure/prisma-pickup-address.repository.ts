import type { PickupAddressView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SITE_SELECT, toPickupView } from "../../sites/infrastructure/site-row.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";

/** Un site qu'on peut choisir pour un retrait : actif, et qui remet. */
const OFFERED = { archivedAt: null, handsOver: true } as const;

/**
 * Adaptateur Prisma des points de retrait proposés. Lecture seule : les sites
 * s'écrivent par leur agrégat (`PrismaSiteRepository`).
 */
@Injectable()
export class PrismaPickupAddressRepository extends PickupAddressRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly PickupAddressView[]> {
    const rows = await this.prisma.site.findMany({
      where: OFFERED,
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: SITE_SELECT,
    });
    return rows.map(toPickupView);
  }

  async resolve(id: string | null): Promise<PickupAddressView | null> {
    const row = await this.prisma.site.findFirst({
      where: id === null ? OFFERED : { ...OFFERED, id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: SITE_SELECT,
    });
    return row === null ? null : toPickupView(row);
  }
}
