import { Injectable } from "@nestjs/common";

import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { UnitOfWorkProbe } from "../domain/ports/unit-of-work-probe.js";

/**
 * L'unité de travail ambiante (`transaction.store.ts`) — le même test que
 * `PrismaOutbox.append` pour refuser un fait durable hors transaction.
 */
@Injectable()
export class AmbientUnitOfWorkProbe extends UnitOfWorkProbe {
  isOpen(): boolean {
    return currentTransaction() !== undefined;
  }
}
