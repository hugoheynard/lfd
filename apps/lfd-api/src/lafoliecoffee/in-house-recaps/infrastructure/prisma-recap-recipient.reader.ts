import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { payerNoticeRecipientOf } from "../../accounting/domain/services/collection-notice-recipient.js";
import {
  type RecapRecipient,
  RecapRecipientReader,
} from "../domain/ports/recap-recipient.reader.js";

/**
 * Le destinataire du récapitulatif, par la règle de la facture
 * (`payerNoticeRecipientOf`) : contacts au rôle `billing` du plus ancien au
 * plus récent, puis le détenteur (`memberships.role = owner`). Tables du
 * compte client, dans le même bloc : une lecture, jamais une écriture.
 */
@Injectable()
export class PrismaRecapRecipientReader extends RecapRecipientReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recipientOf(payerId: string): Promise<RecapRecipient | null> {
    const contacts = await this.prisma.companyContact.findMany({
      where: { companyId: payerId, role: "billing" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, email: true },
    });
    const owner = await this.prisma.membership.findFirst({
      where: { companyId: payerId, role: "owner" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { user: { select: { id: true, email: true } } },
    });
    const recipient = payerNoticeRecipientOf({
      billingContacts: contacts.map((contact) => ({
        id: `contact:${contact.id}`,
        email: contact.email,
      })),
      owner: owner === null ? null : { id: `user:${owner.user.id}`, email: owner.user.email },
    });
    return recipient === null ? null : { id: recipient.id, email: recipient.email };
  }
}
