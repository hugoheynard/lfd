import type { DossierRecipientView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  type StaffContact,
  StaffContacts,
} from "../../../staff/directory/domain/staff-contacts.js";
import {
  DossierRecipientsReader,
  type StoredDossierRecipient,
} from "../../domain/ports/dossier-recipients.reader.js";
import { ListDossierRecipientsQuery } from "./list-dossier-recipients.query.js";

/**
 * **La liste des destinataires**, telle que l'envoi la verrait aujourd'hui
 * (plan `plan-envoi-du-dossier.md`, E2) : une fiche du personnel se lit avec
 * son nom et son adresse du jour. Suspendue ou disparue, elle reste dans la
 * liste et le dit (`inactive`) — c'est à qui règle de la retirer.
 */
@QueryHandler(ListDossierRecipientsQuery)
export class ListDossierRecipientsHandler implements IQueryHandler<
  ListDossierRecipientsQuery,
  readonly DossierRecipientView[]
> {
  constructor(
    private readonly recipients: DossierRecipientsReader,
    private readonly staff: StaffContacts,
  ) {}

  async execute(): Promise<readonly DossierRecipientView[]> {
    const rows = await this.recipients.list();
    const cards = await this.staff.contactsOf(
      rows.flatMap((row) => (row.kind === "staff" ? [row.staffUserId] : [])),
    );
    return rows.map((row) => viewOf(row, cards));
  }
}

function viewOf(
  row: StoredDossierRecipient,
  cards: ReadonlyMap<string, StaffContact>,
): DossierRecipientView {
  if (row.kind === "external") {
    return { ...row, staffUserId: null };
  }
  const card = cards.get(row.staffUserId);
  return {
    id: row.id,
    kind: "staff",
    email: card?.email ?? "",
    firstName: card?.firstName ?? "",
    lastName: card?.lastName ?? "",
    jobTitle: card === undefined || card.jobTitle === "" ? null : card.jobTitle,
    staffUserId: row.staffUserId,
    inactive: card === undefined || !card.active,
  };
}
