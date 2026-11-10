import type { BatchedMandatesReader } from "../domain/ports/batched-mandates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import {
  judgeTestDebtor,
  type TestDebtorVerdict,
} from "../domain/services/collection-test-debtor.js";

/** Les lectures qu'un jugement d'essai demande. */
export interface TestDebtorReaders {
  readonly mandates: CollectionMandatesReader;
  readonly batched: BatchedMandatesReader;
}

/** Une société telle que l'essai la juge. */
export interface JudgedCompany {
  readonly companyId: string;
  readonly name: string;
  readonly status: string;
  readonly declared: boolean;
}

/**
 * Lit ce que la règle demande, puis la fait trancher par le domaine
 * (`judgeTestDebtor`) — la même pour l'écran et pour la génération.
 */
export async function testDebtorVerdictOf(
  readers: TestDebtorReaders,
  company: JudgedCompany,
): Promise<TestDebtorVerdict> {
  const carried = await readers.mandates.activeFor([company.companyId]);
  const mandates = carried.filter((mandate) => mandate.companyId === company.companyId);
  const batchedMandateIds = await readers.batched.batched(
    mandates.map((mandate) => mandate.mandateId),
  );
  return judgeTestDebtor({
    companyName: company.name,
    companyStatus: company.status,
    declared: company.declared,
    mandates,
    batchedMandateIds,
  });
}
