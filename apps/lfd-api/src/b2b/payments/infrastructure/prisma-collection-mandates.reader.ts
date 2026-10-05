import { Injectable } from "@nestjs/common";

import {
  CollectionMandatesReader,
  type CollectionMandate,
} from "../../accounting/domain/ports/collection-mandates.reader.js";
import {
  MandateRecheckReader,
  type MandateNow,
} from "../../accounting/domain/ports/mandate-recheck.reader.js";
import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les mandats actifs, **tous créanciers confondus**, pour la constitution d'un
 * lot. Rangé côté `payments`, qui possède `payment_mandates` et
 * `company_bank_accounts` — même raison que `PrismaDebtorMandateReader`.
 */
@Injectable()
export class PrismaCollectionMandatesReader extends CollectionMandatesReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async activeFor(companyIds: readonly string[]): Promise<readonly CollectionMandate[]> {
    if (companyIds.length === 0) {
      return [];
    }
    const [mandates, accounts] = await Promise.all([
      this.prisma.paymentMandate.findMany({
        where: { companyId: { in: [...companyIds] }, status: "active" },
        orderBy: { id: "asc" },
        select: {
          id: true,
          companyId: true,
          creditorId: true,
          reference: true,
          scheme: true,
          paymentType: true,
          acceptedAt: true,
        },
      }),
      this.prisma.companyBankAccount.findMany({
        where: { companyId: { in: [...companyIds] } },
        select: { companyId: true, ibanSealed: true, bic: true },
      }),
    ]);
    const accountOf = new Map(accounts.map((row) => [row.companyId, row]));
    return mandates.flatMap((mandate) => {
      const account = accountOf.get(mandate.companyId);
      if (account === undefined) {
        return [];
      }
      if (mandate.acceptedAt === null) {
        throw new UnsignedActiveMandateError(mandate.id);
      }
      return [
        {
          mandateId: mandate.id,
          companyId: mandate.companyId,
          creditorId: mandate.creditorId,
          reference: mandate.reference,
          iban: this.cipher.open(account.ibanSealed),
          bic: account.bic === "" ? null : account.bic,
          scheme: mandate.scheme,
          paymentType: mandate.paymentType,
          signedAt: mandate.acceptedAt,
        },
      ];
    });
  }
}

/**
 * La relecture du dépôt : chaque mandat d'un lot est-il encore actif, et sur
 * quel compte ? L'IBAN est celui du RIB recopié AUJOURD'HUI — un changement de
 * RIB après constitution se voit donc ici.
 */
@Injectable()
export class PrismaMandateRecheckReader extends MandateRecheckReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async currentOf(mandateIds: readonly string[]): Promise<ReadonlyMap<string, MandateNow>> {
    const mandates = await this.prisma.paymentMandate.findMany({
      where: { id: { in: [...mandateIds] } },
      select: { id: true, companyId: true, status: true },
    });
    const accounts = await this.prisma.companyBankAccount.findMany({
      where: { companyId: { in: mandates.map((mandate) => mandate.companyId) } },
      select: { companyId: true, ibanSealed: true },
    });
    const ibanOf = new Map(
      accounts.map((row) => [row.companyId, this.cipher.open(row.ibanSealed)]),
    );
    return new Map(
      mandates.map((mandate) => [
        mandate.id,
        { active: mandate.status === "active", iban: ibanOf.get(mandate.companyId) ?? null },
      ]),
    );
  }
}

/** Inatteignable tant que `payment_mandates_active_is_signed` existe. */
class UnsignedActiveMandateError extends TechnicalError {
  constructor(mandateId: string) {
    super(
      "payments.collection_mandate.active_without_signature",
      `Le mandat actif ${mandateId} n'a pas de date de signature : le lot ne peut pas l'écrire. Vérifier la migration « mandat_actif_signe », puis corriger la ligne.`,
    );
  }
}
