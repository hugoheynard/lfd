import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OperationImageLibrary } from "../../operations/channels/media/operation-image-library.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../domain/ports/received-operations.reader.js";
import { ITEMS_IN_ORDER, toOperationState, toOverrideState } from "./catalog-operation-rows.js";
import { withLibraryAlts } from "./operation-library-alts.js";

/**
 * L'écran de réception et l'éditeur de vitrine : tout le miroir, retirées
 * comprises, surcharge jointe.
 *
 * Interrupteur `OPERATIONS_AT_COMMERCE` ouvert (lot 3), chaque opération dit
 * aussi ce que le commerce en tient (`held`), et son image prend le texte
 * alternatif de la médiathèque.
 */
@Injectable()
export class PrismaReceivedOperationsReader extends ReceivedOperationsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly library: OperationImageLibrary,
  ) {
    super();
  }

  async list(): Promise<readonly ReceivedOperation[]> {
    const atCommerce = this.config.operationsAtCommerce();
    const rows = await this.prisma.catalogOperation.findMany({
      include: { ...ITEMS_IN_ORDER, override: true },
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    const operations = rows.map((row): ReceivedOperation => {
      const state = toOperationState(row);
      const override = row.override === null ? null : toOverrideState(row.override);
      return atCommerce
        ? {
            received: state.facts,
            withdrawnAt: state.withdrawnAt,
            override,
            held: { hidden: row.hidden, writtenAt: row.writtenAt },
          }
        : { received: state.facts, withdrawnAt: state.withdrawnAt, override };
    });
    if (!atCommerce) {
      return operations;
    }
    const facts = await withLibraryAlts(
      this.library,
      operations.map((operation) => operation.received),
    );
    return operations.map((operation, index) => ({
      ...operation,
      received: facts[index] ?? operation.received,
    }));
  }
}
