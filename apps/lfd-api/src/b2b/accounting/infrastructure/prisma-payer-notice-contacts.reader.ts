import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerNoticeContactsReader } from "../domain/ports/payer-notice-contacts.reader.js";
import type { PayerNoticeContacts } from "../domain/services/collection-notice-recipient.js";

/**
 * Les adresses d'avis des sociétés payeuses : leurs contacts au rôle
 * `billing` (`company_contacts`, du plus ancien au plus récent) et leur
 * détenteur (`memberships.role = owner` → `users.email`). Tables du compte
 * client, dans le même bloc `b2b` : une lecture, jamais une écriture.
 */
@Injectable()
export class PrismaPayerNoticeContactsReader extends PayerNoticeContactsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async contactsOf(
    companyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PayerNoticeContacts>> {
    if (companyIds.length === 0) {
      return new Map();
    }
    // L'une après l'autre : lues dans la transaction de la constitution.
    const contacts = await this.prisma.companyContact.findMany({
      where: { companyId: { in: [...companyIds] }, role: "billing" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, companyId: true, email: true },
    });
    const owners = await this.prisma.membership.findMany({
      where: { companyId: { in: [...companyIds] }, role: "owner" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { companyId: true, user: { select: { id: true, email: true } } },
    });
    return new Map(
      companyIds.map((companyId) => {
        const owner = owners.find((row) => row.companyId === companyId)?.user ?? null;
        return [
          companyId,
          {
            billingContacts: contacts
              .filter((contact) => contact.companyId === companyId)
              .map((contact) => ({ id: `contact:${contact.id}`, email: contact.email })),
            owner: owner === null ? null : { id: `user:${owner.id}`, email: owner.email },
          },
        ];
      }),
    );
  }
}
