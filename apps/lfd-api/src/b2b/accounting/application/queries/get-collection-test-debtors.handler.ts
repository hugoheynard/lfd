import type { CollectionTestDebtorView, CollectionTestDebtorsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AppError } from "../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MAX_COLLECTION_TEST_CENTS } from "../../domain/entities/collection-test.js";
import { CollectionTestCreditorNotFoundError } from "../../domain/errors/collection-test-errors.js";
import { CreditorBicMissingError } from "../../domain/errors/accounting-errors.js";
import { BatchedMandatesReader } from "../../domain/ports/batched-mandates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import type { OwnEstablishmentRow } from "../../domain/ports/own-establishments.reader.js";
import { OwnEstablishmentsReader } from "../../domain/ports/own-establishments.reader.js";
import type { TestMandate } from "../../domain/services/collection-test-debtor.js";
import {
  DEFAULT_TEST_REMITTANCE,
  earliestTestCollectionDay,
} from "../../domain/services/collection-test-file.js";
import { testDebtorVerdictOf } from "../collection-test-support.js";
import { GetCollectionTestDebtorsQuery } from "./collection-test-queries.js";

/** Les quatre derniers caractères d'un IBAN — jamais plus. */
const IBAN_TAIL = 4;

/**
 * **L'outil d'essai** : chacun de nos établissements, avec le mandat sous
 * lequel il serait prélevé, les séquences permises et l'échéance proposée — ou
 * le refus que la génération lèverait, en mots. Une lecture : la même règle
 * que la génération (`judgeTestDebtor`), rien d'écrit.
 */
@QueryHandler(GetCollectionTestDebtorsQuery)
export class GetCollectionTestDebtorsHandler implements IQueryHandler<
  GetCollectionTestDebtorsQuery,
  CollectionTestDebtorsView
> {
  constructor(
    private readonly establishments: OwnEstablishmentsReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly batched: BatchedMandatesReader,
    private readonly creditors: CreditorReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<CollectionTestDebtorsView> {
    const at = this.clock.now();
    const rows = await this.establishments.list();
    const debtors: CollectionTestDebtorView[] = [];
    for (const row of rows) {
      debtors.push(await this.debtorOf(row, at));
    }
    return {
      maxAmountCents: MAX_COLLECTION_TEST_CENTS,
      defaultRemittance: DEFAULT_TEST_REMITTANCE,
      debtors,
    };
  }

  private async debtorOf(row: OwnEstablishmentRow, at: Date): Promise<CollectionTestDebtorView> {
    const base = { companyId: row.companyId, companyName: row.companyName };
    const verdict = await testDebtorVerdictOf(
      { mandates: this.mandates, batched: this.batched },
      {
        companyId: row.companyId,
        name: row.companyName,
        status: row.companyStatus,
        declared: true,
      },
    );
    if (verdict.kind === "refused") {
      return {
        ...base,
        mandate: null,
        sequences: [],
        earliestCollectionDay: null,
        refusal: verdict.refusal.message,
      };
    }
    const mandate = mandateView(verdict.mandate);
    try {
      const creditor = await this.creditors.snapshot(verdict.mandate.creditorId);
      if (creditor === null) {
        throw new CollectionTestCreditorNotFoundError(verdict.mandate.reference);
      }
      if (creditor.creditorBic === null || creditor.creditorBic === "") {
        throw new CreditorBicMissingError(creditor.name);
      }
      const earliestCollectionDay = earliestTestCollectionDay(at, creditor);
      return {
        ...base,
        mandate,
        sequences: verdict.sequences,
        earliestCollectionDay,
        refusal: null,
      };
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      return {
        ...base,
        mandate,
        sequences: [],
        earliestCollectionDay: null,
        refusal: error.message,
      };
    }
  }
}

function mandateView(mandate: TestMandate): CollectionTestDebtorView["mandate"] {
  return {
    reference: mandate.reference,
    scheme: mandate.scheme,
    paymentType: mandate.paymentType,
    ibanLast4: mandate.iban.slice(-IBAN_TAIL),
  };
}
