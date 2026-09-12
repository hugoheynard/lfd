import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CompanyBankAccount } from "../domain/entities/company-bank-account.js";
import { CompanyNotFoundForBankAccountError } from "../domain/errors/mandate-errors.js";
import { CompanyBankAccountRepository } from "../domain/ports/company-bank-account.repository.js";
import { toColumns, toDomain } from "./company-bank-account.mapper.js";

/**
 * Adaptateur Prisma du RIB client.
 *
 * Il ne fait plus que deux requêtes : le scellement et son inverse vivent dans
 * `company-bank-account.mapper.ts`, pures et éprouvées contre le vrai
 * chiffrement. Ce fichier ne sait que parler à Postgres.
 */
@Injectable()
export class PrismaCompanyBankAccountRepository extends CompanyBankAccountRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async findByCompany(companyId: string): Promise<CompanyBankAccount | null> {
    const row = await this.prisma.companyBankAccount.findUnique({ where: { companyId } });
    return row === null ? null : toDomain(row, this.cipher);
  }

  async save(account: CompanyBankAccount): Promise<void> {
    const snapshot = account.toPersistence();
    const written = toColumns(snapshot, this.cipher);

    try {
      // `upsert` sur `company_id` plutôt que « lire puis créer ou mettre à jour » :
      // deux requêtes simultanées passeraient toutes deux la lecture, et la
      // seconde échouerait sur l'index unique. Ici, c'est Postgres qui tranche.
      await this.prisma.companyBankAccount.upsert({
        where: { companyId: snapshot.companyId },
        create: { id: snapshot.id, companyId: snapshot.companyId, ...written },
        update: written,
      });
    } catch (error) {
      // Une société inconnue viole la clé étrangère. La traduire ici plutôt que
      // de la prévenir par une lecture : la lecture ferait une requête de plus
      // sur le chemin NORMAL pour attraper un cas qui n'arrive qu'en se
      // trompant d'URL, et laisserait quand même une fenêtre entre les deux.
      if (!isForeignKeyViolation(error)) {
        throw error;
      }
      throw new CompanyNotFoundForBankAccountError(snapshot.companyId);
    }
  }
}

/** Violation de clé étrangère côté Prisma. */
const FOREIGN_KEY_VIOLATION = "P2003";

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    Reflect.get(error, "code") === FOREIGN_KEY_VIOLATION
  );
}
