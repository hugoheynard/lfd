import type { CustomerRequestStatus, CustomerRequestView, RequestKind } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CustomerRequestReader,
  type StoredRequestPhoto,
} from "../domain/ports/customer-request.reader.js";
import { PHOTOS_BY_POSITION, toView } from "./customer-request.mapper.js";

/** Adaptateur Prisma de la boîte « Demandes clients ». */
@Injectable()
export class PrismaCustomerRequestReader extends CustomerRequestReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(
    status: CustomerRequestStatus,
    kind: RequestKind | null,
    limit: number,
  ): Promise<CustomerRequestView[]> {
    const rows = await this.prisma.customerRequest.findMany({
      where: {
        ...(status === "pending" ? { handledAt: null } : { handledAt: { not: null } }),
        ...(kind === null ? {} : { kind }),
      },
      // À traiter : urgent d'abord (l'énumération est déclarée dans l'ordre
      // croissant, cf. `contact.prisma`), puis la plus ancienne.
      orderBy:
        status === "pending"
          ? [{ priority: "desc" }, { receivedAt: "asc" }]
          : [{ handledAt: "desc" }],
      take: limit,
      include: PHOTOS_BY_POSITION,
    });
    return rows.map(toView);
  }

  async photo(requestId: string, photoId: string): Promise<StoredRequestPhoto | null> {
    const row = await this.prisma.customerRequestPhoto.findFirst({
      where: { id: photoId, requestId, purgedAt: null },
      select: { storageKey: true, contentType: true },
    });
    return row;
  }
}
