import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OperationImageLibrary } from "../../operations/channels/media/operation-image-library.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../domain/ports/received-operations.reader.js";
import { ITEMS_IN_ORDER, toOperationState } from "./catalog-operation-rows.js";
import { withLibraryAlts } from "./operation-library-alts.js";

/**
 * L'éditeur de vitrine : tout le miroir, retirées comprises.
 *
 * Chaque opération dit aussi si le commerce la masque (`hidden`), et son image
 * prend le texte alternatif de la médiathèque.
 */
@Injectable()
export class PrismaReceivedOperationsReader extends ReceivedOperationsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly library: OperationImageLibrary,
  ) {
    super();
  }

  async list(): Promise<readonly ReceivedOperation[]> {
    const rows = await this.prisma.catalogOperation.findMany({
      include: ITEMS_IN_ORDER,
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    const operations = rows.map((row): ReceivedOperation => {
      const state = toOperationState(row);
      return {
        received: state.facts,
        withdrawnAt: state.withdrawnAt,
        hidden: row.hidden,
      };
    });
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
