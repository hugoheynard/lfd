import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { DurableFactPayloads } from "./durable-fact-payloads.js";

function recordOf(payload: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return Object.fromEntries(Object.entries(payload));
}

/** La charge lue dans `platform.outbox` par sa clé unique — une ligne au plus. */
@Injectable()
export class PrismaDurableFactPayloads extends DurableFactPayloads {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async payloadOf(key: string): Promise<Readonly<Record<string, unknown>> | null> {
    const row = await this.prisma.outboxMessage.findUnique({
      where: { key },
      select: { payload: true },
    });
    return row === null ? null : recordOf(row.payload);
  }
}
