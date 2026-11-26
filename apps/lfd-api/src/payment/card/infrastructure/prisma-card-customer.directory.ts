import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CardCustomerReader } from "../domain/ports/card-customer.reader.js";
import {
  type CardCustomerLink,
  CardCustomerRecorder,
} from "../domain/ports/card-customer.recorder.js";
import type { PaymentAccount } from "../domain/value-objects/payment-account.js";
import { MissingCardCustomerError } from "../domain/errors/card-payment-errors.js";

/**
 * **La correspondance personne → client du prestataire**, table
 * `payment.card_customer` — l'écrivain unique de la table. Aucun nom, aucune
 * adresse : l'identifiant opaque de la personne et la référence du client.
 */
@Injectable()
export class PrismaCardCustomerDirectory extends CardCustomerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(account: PaymentAccount, userId: string): Promise<string | null> {
    const row = await this.prisma.cardCustomer.findUnique({
      where: { account_userId: { account: account.name, userId } },
      select: { providerRef: true },
    });
    return row?.providerRef ?? null;
  }
}

/** Le port d'écriture de la même table : une course perdue rend la ligne déjà écrite. */
@Injectable()
export class PrismaCardCustomerRecorder extends CardCustomerRecorder {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(link: CardCustomerLink): Promise<string> {
    await this.prisma.cardCustomer.createMany({
      data: [
        {
          account: link.account.name,
          userId: link.userId,
          providerRef: link.customerRef,
          createdAt: link.at,
        },
      ],
      skipDuplicates: true,
    });
    const row = await this.prisma.cardCustomer.findUnique({
      where: { account_userId: { account: link.account.name, userId: link.userId } },
      select: { providerRef: true },
    });
    if (row === null) {
      throw new MissingCardCustomerError(link.account.name, link.userId);
    }
    return row.providerRef;
  }
}
