import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { buildCycleDraft } from "../cycle-draft-support.js";
import { BillableOrdersReader } from "../../domain/ports/billable-orders.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
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
    const draft = await buildCycleDraft(
      { creditors: this.creditors, billable: this.billable, clock: this.clock },
      query.legalEntityId,
    );
    return {
      xml: draft.xml,
      // Le nom porte l'avertissement : un fichier rangé sur un bureau perd son
      // contexte, jamais son nom.
      fileName: `BROUILLON-prelevement-${draft.cycleTag}.xml`,
    };
  }
}
