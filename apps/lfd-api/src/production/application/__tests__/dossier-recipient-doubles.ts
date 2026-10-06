import {
  ReachableStaff,
  StaffContacts,
  type StaffContact,
} from "../../../staff/directory/domain/staff-contacts.js";
import type { DossierRecipient } from "../../domain/entities/dossier-recipient.js";
import { DossierRecipients } from "../../domain/entities/dossier-recipients.js";
import {
  DossierRecipientsReader,
  type StoredDossierRecipient,
} from "../../domain/ports/dossier-recipients.reader.js";
import { DossierRecipientsRepository } from "../../domain/ports/dossier-recipients.repository.js";

/** L'annuaire doublé : des fiches posées par le test. */
export class Directory extends StaffContacts {
  readonly cards = new Map<string, StaffContact>();

  put(card: StaffContact): this {
    this.cards.set(card.staffUserId, card);
    return this;
  }

  contactsOf(ids: readonly string[]): Promise<ReadonlyMap<string, StaffContact>> {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const card = this.cards.get(id);
          return card === undefined ? [] : [[id, card] as const];
        }),
      ),
    );
  }
}

/** Le personnel joignable doublé. */
export class Reachable extends ReachableStaff {
  constructor(private readonly contacts: readonly StaffContact[]) {
    super();
  }

  list(): Promise<readonly StaffContact[]> {
    return Promise.resolve(this.contacts);
  }
}

/** La liste doublée : les lignes vivantes et le compte des sauvegardes. */
export class RecipientsTable extends DossierRecipientsRepository {
  live: readonly DossierRecipient[] = [];
  saves = 0;

  load(): Promise<DossierRecipients> {
    return Promise.resolve(DossierRecipients.restore(this.live));
  }

  save(recipients: DossierRecipients): Promise<void> {
    this.live = recipients.recipients;
    this.saves += 1;
    return Promise.resolve();
  }
}

/** La lecture doublée : des lignes posées par le test. */
export class RecipientsRows extends DossierRecipientsReader {
  constructor(private readonly rows: readonly StoredDossierRecipient[]) {
    super();
  }

  list(): Promise<readonly StoredDossierRecipient[]> {
    return Promise.resolve(this.rows);
  }
}

/** Une fiche de l'annuaire, active par défaut. */
export function staffCard(overrides: Partial<StaffContact> = {}): StaffContact {
  return {
    staffUserId: "s-paul",
    firstName: "Paul",
    lastName: "Martin",
    email: "paul@fournil.fr",
    jobTitle: "Chef",
    active: true,
    ...overrides,
  };
}
