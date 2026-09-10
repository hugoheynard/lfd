import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillableOrdersReader } from "../../domain/ports/billable-orders.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { cycleAt } from "../../domain/services/billing-cycle.js";
import { cycleTagOf, renderPain008 } from "../../domain/services/pain008.js";
import { ExportCycleDraftQuery } from "./billing-cycle-queries.js";

/** Le fichier et le nom qu'on propose au navigateur. */
export interface CycleDraftFile {
  readonly xml: string;
  readonly fileName: string;
}

/**
 * Rend le brouillon de `pain.008` du cycle en cours.
 *
 * 🔴 Il lit l'émetteur par `CreditorReader`, qui **refuse** de rendre une copie
 * pour une entité sans ICS ni compte (409 nommant ce qui manque). L'incomplétude
 * du bloc créancier est donc **inexprimable** ici, comme pour la fiche de
 * mandat : il n'y a aucune branche à écrire, donc aucune à oublier.
 *
 * Ce qui reste incomplet — l'IBAN du débiteur, sa RUM — l'est de l'autre côté,
 * et le rendu le marque plutôt que de l'inventer. Voir le JSDoc de `pain008.ts`.
 *
 * ⚠️ `null` en clôture précédente : aucune clôture n'est encore enregistrée
 * (vérifié le 2026-09-10 — rien n'en écrit dans `src/`). Le cycle se rabat donc
 * sur le mois calendaire, et ce sera la même ligne à changer ici et dans
 * `get-current-billing-cycle.handler.ts` le jour venu.
 */
@QueryHandler(ExportCycleDraftQuery)
export class ExportCycleDraftHandler implements IQueryHandler<
  ExportCycleDraftQuery,
  CycleDraftFile
> {
  constructor(
    private readonly creditors: CreditorReader,
    private readonly billable: BillableOrdersReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ExportCycleDraftQuery): Promise<CycleDraftFile> {
    const creditor = await this.creditors.snapshot(query.legalEntityId);
    if (creditor === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }

    const now = this.clock.now();
    const cycle = cycleAt(now, null);
    const lines = await this.billable.billableBetween(cycle.startsAt, cycle.closesAt);

    return {
      xml: renderPain008({
        creditor,
        cycleStart: cycle.startsAt,
        cycleEnd: cycle.closesAt,
        createdAt: now,
        lines,
      }),
      // Le nom porte l'avertissement : un fichier rangé sur un bureau perd son
      // contexte, jamais son nom.
      //
      // 🔴 L'étiquette vient du DOMAINE, pas d'un `toISOString()` sur la clôture.
      // Deux raisons : la borne haute est exclusive — un cycle clos le 1er
      // octobre est celui de septembre — et `toISOString()` est en UTC, alors
      // que la borne est posée à minuit LOCAL. Les deux erreurs se composaient
      // et donnaient un nom de fichier en désaccord avec le `MsgId` qu'il porte.
      fileName: `BROUILLON-prelevement-${cycleTagOf(cycle.closesAt)}.xml`,
    };
  }
}
