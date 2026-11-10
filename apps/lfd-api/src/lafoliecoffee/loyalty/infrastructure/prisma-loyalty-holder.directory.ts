import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  LoyaltyHolderDirectory,
  type LoyaltyHolderDescription,
} from "../domain/ports/loyalty-holder.directory.js";
import type { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";
import { personLabel } from "./loyalty-holder-label.js";

/**
 * Le nom d'un titulaire, lu dans les tables des comptes — celles du même bloc
 * (`b2b`), lues et jamais écrites. Ni l'adresse e-mail, ni le téléphone.
 */
@Injectable()
export class PrismaLoyaltyHolderDirectory extends LoyaltyHolderDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async describe(holder: LoyaltyHolder): Promise<LoyaltyHolderDescription | null> {
    if (holder.kind === "company") {
      const company = await this.prisma.company.findUnique({
        where: { id: holder.id },
        select: { raisonSociale: true },
      });
      return company === null ? null : { label: company.raisonSociale };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: holder.id },
      select: { firstName: true, lastName: true },
    });
    return user === null ? null : { label: personLabel(user) };
  }
}
