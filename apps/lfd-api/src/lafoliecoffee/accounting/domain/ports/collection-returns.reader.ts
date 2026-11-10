import type { BankReturnKind } from "../value-objects/bank-return-reason.js";
import type {
  CollectionReturnResolution,
  CollectionReturnSource,
} from "../entities/collection-return.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Un retour, tel que les écrans le lisent. Jamais d'IBAN. */
export interface CollectionReturnRow {
  readonly id: string;
  readonly endToEndId: string;
  readonly batchId: string;
  readonly lineRank: number;
  readonly scheme: SepaScheme;
  readonly cycleClosesAt: Date;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly kind: BankReturnKind;
  readonly reasonCode: string;
  readonly reasonLabel: string | null;
  readonly returnedOn: string;
  readonly amountCents: number;
  readonly feeCents: number | null;
  readonly source: CollectionReturnSource;
  readonly recordedAt: Date;
  readonly resolution: CollectionReturnResolution;
  readonly resolutionNote: string | null;
  readonly resolvedAt: Date | null;
}

/** Port de LECTURE des retours : celui du lot, celui du payeur. */
export abstract class CollectionReturnsReader {
  abstract ofBatch(batchId: string): Promise<readonly CollectionReturnRow[]>;

  /** Les retours dont la ligne débitait cette société, du plus récent au plus ancien. */
  abstract ofPayer(companyId: string): Promise<readonly CollectionReturnRow[]>;
}
