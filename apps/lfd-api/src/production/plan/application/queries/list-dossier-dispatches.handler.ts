import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffContacts } from "../../../../staff/directory/domain/staff-contacts.js";
import {
  type DossierDispatchTrace,
  DossierDispatchesReader,
} from "../../domain/ports/dossier-dispatches.reader.js";
import { DossierRecipientsReader } from "../../domain/ports/dossier-recipients.reader.js";
import { dossierAddresseesOf } from "../../domain/services/dossier-addressees.js";
import { ListDossierDispatchesQuery } from "./list-dossier-dispatches.query.js";
import type { DossierDispatchView } from "./plan-version.views.js";

/**
 * **À qui le dossier partirait aujourd'hui, et ce que chacun a reçu de la
 * journée** (`documentation/fournil/plan-historique-des-tirages.md`, § 7 Q2,
 * pour le réenvoi de H6). Les destinataires sont ceux qu'un envoi servirait
 * maintenant (`dossierAddresseesOf` : fiche suspendue ou sans adresse
 * écartée) ; une ligne retirée de la liste n'y figure plus, même si elle a
 * reçu un dossier ce jour-là.
 */
@QueryHandler(ListDossierDispatchesQuery)
export class ListDossierDispatchesHandler implements IQueryHandler<
  ListDossierDispatchesQuery,
  readonly DossierDispatchView[]
> {
  constructor(
    private readonly recipients: DossierRecipientsReader,
    private readonly staff: StaffContacts,
    private readonly dispatches: DossierDispatchesReader,
  ) {}

  async execute(query: ListDossierDispatchesQuery): Promise<readonly DossierDispatchView[]> {
    const rows = await this.recipients.list();
    if (rows.length === 0) {
      return [];
    }
    const [cards, traces] = await Promise.all([
      this.staff.contactsOf(rows.flatMap((row) => (row.kind === "staff" ? [row.staffUserId] : []))),
      this.dispatches.of(query.serviceDay),
    ]);
    return dossierAddresseesOf(rows, cards).map((addressee) => {
      const mine = traces.filter((trace) => trace.recipientId === addressee.recipientId);
      const lastSent = latest(mine.filter((trace) => trace.outcome === "sent"));
      const lastAttempt = latest(mine);
      return {
        recipientId: addressee.recipientId,
        name: addressee.name,
        lastReceived: lastSent === null ? null : markOf(lastSent),
        lastAttempt:
          lastAttempt === null ? null : { ...markOf(lastAttempt), outcome: lastAttempt.outcome },
      };
    });
  }
}

function latest(traces: readonly DossierDispatchTrace[]): DossierDispatchTrace | null {
  return traces.reduce<DossierDispatchTrace | null>(
    (best, trace) => (best === null || trace.claimedAt >= best.claimedAt ? trace : best),
    null,
  );
}

function markOf(trace: DossierDispatchTrace): { at: string; planVersion: number | null } {
  return { at: trace.claimedAt.toISOString(), planVersion: trace.planVersion };
}
