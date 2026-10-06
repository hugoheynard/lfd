import { addressPointKindSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { IgnoredAddressPointsReader } from "../domain/ports/ignored-address-points.reader.js";
import type { IgnoredPoint } from "../domain/services/address-point-suggestions.js";

/**
 * Les suggestions ignorées dont le point tient encore (§6) — celles que la
 * purge n'a pas effacées. Le genre est relu par le schéma du contrat : un CHECK
 * le tient en base, une autre valeur lève plutôt que d'être devinée.
 */
@Injectable()
export class PrismaIgnoredAddressPointsReader extends IgnoredAddressPointsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ignored(): Promise<readonly IgnoredPoint[]> {
    const rows = await this.prisma.deliveryAddressSuggestionDecision.findMany({
      where: { outcome: "ignored", pointLat: { not: null }, pointLng: { not: null } },
      select: { addressId: true, kind: true, pointLat: true, pointLng: true },
    });
    return rows.flatMap((row) =>
      row.pointLat === null || row.pointLng === null
        ? []
        : [
            {
              addressId: row.addressId,
              kind: addressPointKindSchema.parse(row.kind),
              point: { lat: row.pointLat, lng: row.pointLng },
            },
          ],
    );
  }
}
