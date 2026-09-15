import { Injectable } from "@nestjs/common";

import {
  DebtorMandateReader,
  type DebtorMandate,
} from "../../accounting/domain/ports/debtor-mandate.reader.js";
import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Adaptateur du port que la comptabilité déclare, **rangé côté `payments`**
 * parce que c'est lui qui possède les deux tables.
 *
 * Deux lectures et une jointure en mémoire plutôt qu'une jointure SQL : les
 * mandats et les comptes sont deux agrégats distincts, et les assembler ici
 * garde la règle — un mandat actif ET un compte recopié — visible en une ligne.
 */
@Injectable()
export class PrismaDebtorMandateReader extends DebtorMandateReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async activeFor(companyIds: readonly string[]): Promise<ReadonlyMap<string, DebtorMandate>> {
    if (companyIds.length === 0) {
      return new Map();
    }

    const [mandates, accounts] = await Promise.all([
      this.prisma.paymentMandate.findMany({
        where: { companyId: { in: [...companyIds] }, status: "active" },
        // Schéma et type lus SUR LE MANDAT : figés à la frappe, ils disent ce que
        // le papier signé autorise, quel que soit le réglage courant de l'entité.
        select: {
          id: true,
          companyId: true,
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
    const found = new Map<string, DebtorMandate>();
    for (const mandate of mandates) {
      const account = accountOf.get(mandate.companyId);
      if (account === undefined) {
        // Mandat signé, compte jamais recopié. Une absence, pas une panne : la
        // société sort du lot en étant nommée, plutôt que d'y entrer sans IBAN.
        continue;
      }
      found.set(mandate.companyId, {
        reference: mandate.reference,
        iban: this.cipher.open(account.ibanSealed),
        // Chaîne vide = absent : le lot écrit alors `NOTPROVIDED`, pas un BIC vide.
        bic: account.bic === "" ? null : account.bic,
        scheme: mandate.scheme,
        paymentType: mandate.paymentType,
        signedAt: signedAtOf(mandate),
      });
    }
    return found;
  }
}

/**
 * La date du papier d'un mandat actif. Le type Prisma la rend nullable parce que
 * la colonne l'est pour un brouillon ; pour un ACTIF, la contrainte
 * `payment_mandates_active_is_signed` l'exige (migration
 * `20260915140000_mandat_actif_signe`).
 */
function signedAtOf(mandate: { readonly id: string; readonly acceptedAt: Date | null }): Date {
  if (mandate.acceptedAt === null) {
    throw new ActiveMandateWithoutSignatureError(mandate.id);
  }
  return mandate.acceptedAt;
}

/**
 * Un mandat actif sans date de signature a été lu.
 *
 * Inatteignable tant que la contrainte existe. Écrite quand même, et en
 * `TechnicalError`, parce que l'alternative — une date de frappe ou du jour —
 * ferait déclarer à la banque un consentement à une date où personne n'a signé.
 */
class ActiveMandateWithoutSignatureError extends TechnicalError {
  constructor(readonly mandateId: string) {
    super(
      "payments.debtor_mandate.active_without_signature",
      `Le mandat actif ${mandateId} n'a pas de date de signature : le lot de prélèvement ne peut pas l'écrire. Vérifier que la migration « mandat_actif_signe » est déployée, puis corriger la ligne en base.`,
    );
  }
}
