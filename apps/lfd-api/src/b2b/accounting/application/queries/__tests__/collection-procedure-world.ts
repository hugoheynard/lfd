import { accountExportWorld } from "../../commands/__tests__/account-bank-export-doubles.js";
import { bankExportWorld } from "../../commands/__tests__/mandate-bank-export-doubles.js";
import {
  FixedModeDates,
  FixedPayerModes,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import { FixedInvoicePeriods } from "../../services/__tests__/issued-invoice-doubles.js";
import {
  FixedBatches,
  FixedBankReturnChecks,
  FixedCoverage,
  FixedLotDebtors,
  PendingReturns,
} from "./collection-procedure-doubles.js";
import { countingOf } from "./counted-payers-doubles.js";
import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { GetCollectionProcedureQuery } from "../collection-procedure-queries.js";
import { GetCollectionProcedureHandler } from "../get-collection-procedure.handler.js";

/**
 * La lecture d'état de la procédure branchée sur ses doublés — un monde par
 * test, partagé par les suites de la lecture.
 */
export function world() {
  const accounts = accountExportWorld();
  const mandates = bankExportWorld();
  const batches = new FixedBatches();
  const returns = new PendingReturns();
  const coverage = new FixedCoverage();
  const counting = countingOf([], []);
  const checks = new FixedBankReturnChecks();
  const lotDebtors = new FixedLotDebtors();
  const handler = new GetCollectionProcedureHandler(
    accounts.entities,
    accounts.accounts,
    accounts.fingerprints,
    mandates.mandates,
    mandates.known,
    mandates.reader,
    batches,
    returns,
    new FixedModeDates(),
    new FixedPayerModes(),
    new FixedInvoicePeriods(new Map()),
    coverage,
    counting.standings,
    counting.mandates,
    counting.lot,
    accounts.clock,
    checks,
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Claire", lastName: "Compta" }, "staff_1"),
    ),
    lotDebtors,
  );
  const read = (batchId: string | null = null, closureDay: string | null = null) =>
    handler.execute(new GetCollectionProcedureQuery("le1", batchId, closureDay));
  return { accounts, mandates, batches, returns, coverage, checks, lotDebtors, read };
}
