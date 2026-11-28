import { Injectable } from "@nestjs/common";

import { CorruptedRecordError } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type DossierDispatchState,
  type DossierDispatchTrace,
  DossierDispatchesReader,
} from "../domain/ports/dossier-dispatches.reader.js";

const STATES: ReadonlySet<string> = new Set<DossierDispatchState>(["pending", "sent", "failed"]);

function isState(value: string): value is DossierDispatchState {
  return STATES.has(value);
}

/** Les envois d'une journée, dans `production.production_dossier_dispatch`. */
@Injectable()
export class PrismaDossierDispatchesReader extends DossierDispatchesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(serviceDay: string): Promise<readonly DossierDispatchTrace[]> {
    const rows = await this.prisma.productionDossierDispatch.findMany({
      where: { serviceDay },
      orderBy: { claimedAt: "asc" },
      select: { recipientId: true, outcome: true, claimedAt: true, planVersion: true },
    });
    return rows.map((row) => {
      if (!isState(row.outcome)) {
        throw new CorruptedRecordError("production.production_dossier_dispatch.outcome");
      }
      return { ...row, outcome: row.outcome };
    });
  }
}
