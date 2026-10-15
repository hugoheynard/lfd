import type { ProPriceMethod } from "@lfd/pim-contracts";

import { AccountingRules } from "../../entities/accounting-rules.js";
import { AccountingRulesReader } from "../accounting-rules.reader.js";
import type { AccountingRulesRecord } from "../accounting-rules.repository.js";

/** Une date de réglage : jamais comparée à l'horloge, seulement rendue. */
const SET_AT = new Date("2026-10-15T08:00:00.000Z");

/**
 * Le double de lecture des règles comptables (lot P) : un réglage fixe, ou
 * `null` pour « jamais réglé ». Hérite du port, comme les autres doubles.
 */
export class FixedAccountingRules extends AccountingRulesReader {
  constructor(private readonly rules: AccountingRules | null) {
    super();
  }

  static with(method: ProPriceMethod, ratioBp: number): FixedAccountingRules {
    return new FixedAccountingRules(
      AccountingRules.reconstitute({ proPriceRatioBp: ratioBp, proPriceMethod: method }),
    );
  }

  read(): Promise<AccountingRulesRecord | null> {
    return Promise.resolve(this.rules === null ? null : { rules: this.rules, updatedAt: SET_AT });
  }
}
