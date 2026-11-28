import { Injectable } from "@nestjs/common";
import type { StaffSettlement } from "@lfd/contracts";

import { CounterAccountCeilingExceededError } from "../../domain/errors/counter-account-ceiling.error.js";
import { CounterAccountCeilingReader } from "../../domain/ports/counter-account-ceiling.reader.js";
import { CounterAccountOutstandingReader } from "../../domain/ports/counter-account-outstanding.reader.js";
import { CompanyStatusReader } from "../../domain/ports/company-status.reader.js";
import { exceedsCounterCeiling } from "../../domain/services/counter-account-ceiling.js";

/** Ce que la garde juge : la société, le règlement choisi, et le total composé. */
export interface CounterCeilingCase {
  readonly companyId: string;
  readonly settlement: StaffSettlement;
  readonly totalCents: number;
}

/**
 * **Le plafond d'un compte ouvert au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.3), jugé à la passation ET à l'estimation de la saisie de l'équipe, après
 * le règlement admis. Ne lit rien d'autre que le statut tant que le règlement
 * n'est pas « au compte » ; ne lit pas l'encours quand aucun plafond n'est posé.
 */
@Injectable()
export class CounterAccountCeilingCheck {
  constructor(
    private readonly statuses: CompanyStatusReader,
    private readonly ceiling: CounterAccountCeilingReader,
    private readonly outstanding: CounterAccountOutstandingReader,
  ) {}

  async refusalFor(
    candidate: CounterCeilingCase,
  ): Promise<CounterAccountCeilingExceededError | null> {
    if (candidate.settlement !== "account") {
      return null;
    }
    if ((await this.statuses.companyStatusOf(candidate.companyId)) !== "counter_opened") {
      return null;
    }
    const ceilingCents = await this.ceiling.ceilingCents();
    if (ceilingCents === null) {
      return null;
    }
    const owed = await this.outstanding.outstandingOf([candidate.companyId]);
    const outstandingCents = owed.get(candidate.companyId) ?? 0;
    return exceedsCounterCeiling(outstandingCents, candidate.totalCents, ceilingCents)
      ? new CounterAccountCeilingExceededError(outstandingCents, candidate.totalCents, ceilingCents)
      : null;
  }
}

/**
 * Aucune garde : la saisie construite sans elle (doubles des suites qui ne
 * jugent pas le plafond). En service, Nest injecte toujours la vraie.
 */
export const NO_COUNTER_CEILING_CHECK: Pick<CounterAccountCeilingCheck, "refusalFor"> = {
  refusalFor: () => Promise.resolve(null),
};
