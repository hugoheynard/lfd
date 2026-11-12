import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderChangeVersionReader } from "../domain/ports/order-change-version.reader.js";

/** `max(id)` et `count(*)` de `public.order_change`, en une requête. */
@Injectable()
export class PrismaOrderChangeVersionReader extends OrderChangeVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(): Promise<number> {
    const found = await this.prisma.orderChange.aggregate({
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
