import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { StaffContacts } from "../../staff/directory/domain/staff-contacts.js";
import { DossierRecipient } from "../domain/entities/dossier-recipient.js";
import { DossierRecipients } from "../domain/entities/dossier-recipients.js";
import { CorruptDossierRecipientError } from "../domain/errors/dossier-recipient-errors.js";
import {
  DossierRecipientsReader,
  type StoredDossierRecipient,
} from "../domain/ports/dossier-recipients.reader.js";
import { DossierRecipientsRepository } from "../domain/ports/dossier-recipients.repository.js";
import { RecipientEmail } from "../domain/value-objects/recipient-email.value-object.js";

interface RecipientRow {
  readonly id: string;
  readonly kind: string;
  readonly staffUserId: string | null;
  readonly email: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly jobTitle: string | null;
  readonly addedBy: string;
  readonly addedAt: Date;
}

/** Les lignes vivantes, dans l'ordre d'inscription. */
function liveRows(prisma: PrismaService): Promise<readonly RecipientRow[]> {
  return prisma.productionDossierRecipient.findMany({
    where: { removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
  });
}

/** Une ligne lue ; une forme que la contrainte de la table interdit est une panne. */
function storedOf(row: RecipientRow): StoredDossierRecipient {
  if (row.kind === "staff" && row.staffUserId !== null) {
    return { id: row.id, kind: "staff", staffUserId: row.staffUserId };
  }
  if (
    row.kind === "external" &&
    row.email !== null &&
    row.firstName !== null &&
    row.lastName !== null
  ) {
    return {
      id: row.id,
      kind: "external",
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      jobTitle: row.jobTitle,
    };
  }
  throw new CorruptDossierRecipientError(row.id, `forme « ${row.kind} » incomplète`);
}

/**
 * Lecture de `production.production_dossier_recipient`, pour l'écran : des
 * lignes, sans agrégat.
 */
@Injectable()
export class PrismaDossierRecipientsReader extends DossierRecipientsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly StoredDossierRecipient[]> {
    return (await liveRows(this.prisma)).map(storedOf);
  }
}

/**
 * Le dépôt de la liste. Au chargement, les fiches du personnel sont relues
 * dans l'annuaire par SON port (`StaffContacts`) — jamais la table
 * `staff_users` en direct : elle appartient à un autre bloc. À la sauvegarde,
 * un ajout s'insère et un retrait s'archive, sous la condition qu'il soit
 * encore vivant.
 */
@Injectable()
export class PrismaDossierRecipientsRepository extends DossierRecipientsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffContacts,
  ) {
    super();
  }

  async load(): Promise<DossierRecipients> {
    const rows = await liveRows(this.prisma);
    const stored = rows.map((row) => ({ row, stored: storedOf(row) }));
    const cards = await this.staff.contactsOf(
      stored.flatMap(({ stored: entry }) => (entry.kind === "staff" ? [entry.staffUserId] : [])),
    );
    return DossierRecipients.restore(
      stored.map(({ row, stored: entry }) => {
        const by = { id: row.id, addedBy: row.addedBy, addedAt: row.addedAt };
        if (entry.kind === "staff") {
          const card = cards.get(entry.staffUserId) ?? null;
          return DossierRecipient.restore(
            { kind: "staff", staffUserId: entry.staffUserId, card },
            by,
          );
        }
        return DossierRecipient.restore(
          {
            kind: "external",
            email: RecipientEmail.of(entry.email),
            firstName: entry.firstName,
            lastName: entry.lastName,
            jobTitle: entry.jobTitle,
          },
          by,
        );
      }),
    );
  }

  async save(recipients: DossierRecipients): Promise<void> {
    if (recipients.added.length > 0) {
      await this.prisma.productionDossierRecipient.createMany({
        data: recipients.added.map(rowOf),
      });
    }
    for (const { recipient, removedBy, removedAt } of recipients.removed) {
      await this.prisma.productionDossierRecipient.updateMany({
        where: { id: recipient.id, removedAt: null },
        data: { removedBy, removedAt },
      });
    }
  }
}

function rowOf(recipient: DossierRecipient): RecipientRow {
  const { target } = recipient;
  const authorship = { id: recipient.id, addedBy: recipient.addedBy, addedAt: recipient.addedAt };
  if (target.kind === "staff") {
    return {
      ...authorship,
      kind: "staff",
      staffUserId: target.staffUserId,
      email: null,
      firstName: null,
      lastName: null,
      jobTitle: null,
    };
  }
  return {
    ...authorship,
    kind: "external",
    staffUserId: null,
    email: target.email.value,
    firstName: target.firstName,
    lastName: target.lastName,
    jobTitle: target.jobTitle,
  };
}
