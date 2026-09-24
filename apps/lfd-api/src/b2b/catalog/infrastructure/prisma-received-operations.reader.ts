import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../domain/ports/received-operations.reader.js";
import { ITEMS_IN_ORDER, toOperationState, toOverrideState } from "./catalog-operation-rows.js";

/** L'écran de réception : tout le miroir, retirées comprises, surcharge jointe. */
@Injectable()
export class PrismaReceivedOperationsReader extends ReceivedOperationsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly ReceivedOperation[]> {
    const rows = await this.prisma.catalogOperation.findMany({
      include: { ...ITEMS_IN_ORDER, override: true },
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    return rows.map((row) => {
      const state = toOperationState(row);
      return {
        received: state.facts,
        withdrawnAt: state.withdrawnAt,
        override: row.override === null ? null : toOverrideState(row.override),
      };
    });
  }
}
