import type { FeatureExemptionAccountState } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  FeatureAccessBoardReader,
  type StoredFeatureAccess,
} from "../domain/ports/feature-access-board.reader.js";

interface AccountRow {
  readonly email: string;
  readonly emailVerified: boolean;
}

/**
 * L'état du compte qui porte une adresse. Plusieurs personnes peuvent partager
 * une adresse (la colonne n'est pas unique) : une seule vérifiée suffit à dire
 * `verified`, puisque c'est ce que la résolution exigera d'elle.
 */
function accountStateOf(
  email: string,
  accounts: readonly AccountRow[],
): FeatureExemptionAccountState {
  const matching = accounts.filter((account) => account.email.trim().toLowerCase() === email);
  if (matching.some((account) => account.emailVerified)) {
    return "verified";
  }
  return matching.length > 0 ? "unverified" : "none";
}

/**
 * Lecture staff de l'accès aux fonctionnalités.
 *
 * Lit `users` en lecture seule : même bloc (`b2b`), deux colonnes, et pour les
 * seules adresses exemptées. Aucune jointure : la table n'a pas de clé vers les
 * personnes, et ne doit pas en avoir — une exemption vaut pour un compte qui
 * n'existe pas encore.
 */
@Injectable()
export class PrismaFeatureAccessBoardReader extends FeatureAccessBoardReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<StoredFeatureAccess> {
    const [overrides, exemptions] = await Promise.all([
      this.prisma.featureAccessOverride.findMany({ orderBy: { key: "asc" } }),
      this.prisma.featureAccessExemption.findMany({ orderBy: [{ key: "asc" }, { email: "asc" }] }),
    ]);
    const accounts = await this.accountsFor(exemptions.map((exemption) => exemption.email));
    return {
      overrides: overrides.map((row) => ({
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt,
        updatedBy: { sub: row.updatedBySub, name: row.updatedByName, role: row.updatedByRole },
      })),
      exemptions: exemptions.map((row) => ({
        id: row.id,
        key: row.key,
        email: row.email,
        createdAt: row.createdAt,
        createdBy: { sub: row.createdBySub, name: row.createdByName, role: row.createdByRole },
        accountState: accountStateOf(row.email, accounts),
      })),
    };
  }

  private async accountsFor(emails: readonly string[]): Promise<readonly AccountRow[]> {
    if (emails.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        OR: [...new Set(emails)].map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
      select: { email: true, emailVerified: true },
    });
  }
}
