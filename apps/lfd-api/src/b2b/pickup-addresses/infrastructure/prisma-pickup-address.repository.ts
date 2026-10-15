import type { CustomerAudience, PickupAddressView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SITE_SELECT, toPickupView } from "../../sites/infrastructure/site-row.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";

/** Un site qu'on peut choisir pour un retrait : actif, et qui remet. */
const OFFERED = { archivedAt: null, pickup: true } as const;

/** La case de la clientèle, dans le `where` : le filtre est en base, pas à l'écran. */
function openTo(audience: CustomerAudience | null) {
  if (audience === null) {
    return OFFERED;
  }
  return audience === "b2b"
    ? { ...OFFERED, pickupForB2b: true }
    : { ...OFFERED, pickupForB2c: true };
}

/** L'ordre d'affichage : par ancienneté (il n'y a plus de défaut en tête). */
const BY_AGE = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * Adaptateur Prisma des points de retrait proposés. Lecture seule : les sites
 * s'écrivent par leur agrégat (`PrismaSiteRepository`).
 */
@Injectable()
export class PrismaPickupAddressRepository extends PickupAddressRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(audience: CustomerAudience | null): Promise<readonly PickupAddressView[]> {
    const rows = await this.prisma.site.findMany({
      where: openTo(audience),
      orderBy: BY_AGE,
      select: SITE_SELECT,
    });
    return rows.map(toPickupView);
  }

  async resolve(id: string): Promise<PickupAddressView | null> {
    const row = await this.prisma.site.findFirst({
      where: { ...OFFERED, id },
      select: SITE_SELECT,
    });
    return row === null ? null : toPickupView(row);
  }
}
