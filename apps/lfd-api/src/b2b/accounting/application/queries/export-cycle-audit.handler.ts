import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BillableOrdersReader } from "../../domain/ports/billable-orders.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { auditCsv } from "../../domain/services/pain008-audit.js";
import { buildCycleDraft } from "../cycle-draft-support.js";
import { ExportCycleAuditQuery } from "./billing-cycle-queries.js";

/** Le CSV de contrôle et le nom qu'on propose au navigateur. */
export interface CycleAuditFile {
  readonly csv: string;
  readonly fileName: string;
}

/**
 * Rend le **contrôle** du brouillon : un CSV lu DEPUIS le XML.
 *
 * 🔴 Le fichier est reconstruit par `buildCycleDraft`, exactement comme celui
 * qu'on télécharge, puis **relu**. C'est ce qui donne sa valeur au contrôle : il
 * atteste ce que le fichier CONTIENT, et non ce qu'on croit y avoir mis. Un CSV
 * recalculé depuis l'assiette pourrait être faux du même défaut que le XML, et
 * les deux s'accorderaient.
 */
@QueryHandler(ExportCycleAuditQuery)
export class ExportCycleAuditHandler implements IQueryHandler<
  ExportCycleAuditQuery,
  CycleAuditFile
> {
  constructor(
    private readonly creditors: CreditorReader,
    private readonly billable: BillableOrdersReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ExportCycleAuditQuery): Promise<CycleAuditFile> {
    const draft = await buildCycleDraft(
      { creditors: this.creditors, billable: this.billable, clock: this.clock },
      query.legalEntityId,
    );
    return {
      csv: auditCsv(draft.xml),
      fileName: `CONTROLE-prelevement-${draft.cycleTag}.csv`,
    };
  }
}
