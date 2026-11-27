import { InHousePayer } from "../../../domain/entities/in-house-payer.js";
import {
  InHouseBillingNeighboursReader,
  type InHouseBillingNeighbours,
} from "../../../domain/ports/in-house-billing-neighbours.reader.js";
import { InHousePayerReader } from "../../../domain/ports/in-house-payer.reader.js";
import { InHousePayerRepository } from "../../../domain/ports/in-house-payer.repository.js";

/** La lecture publiée, sur une liste fixe de payeurs maison (aucun par défaut). */
export class KnownInHousePayers extends InHousePayerReader {
  private readonly ids: ReadonlySet<string>;
  constructor(ids: Iterable<string> = []) {
    super();
    this.ids = new Set(ids);
  }
  isInHousePayer(payerId: string): Promise<boolean> {
    return Promise.resolve(this.ids.has(payerId));
  }
}

/** Aucun suivi de facturation. */
const ALONE: InHouseBillingNeighbours = { principalInHouse: null, sites: [] };

/**
 * Des voisins de facturation fixes : les mêmes pour toute société, ou une
 * table par société (aucun suivi pour une société absente de la table).
 */
export class FixedInHouseNeighbours extends InHouseBillingNeighboursReader {
  constructor(
    private readonly neighbours:
      InHouseBillingNeighbours | ReadonlyMap<string, InHouseBillingNeighbours> = ALONE,
  ) {
    super();
  }
  neighboursOf(companyId: string): Promise<InHouseBillingNeighbours> {
    const table = this.neighbours;
    return Promise.resolve("principalInHouse" in table ? table : (table.get(companyId) ?? ALONE));
  }
}

/** Une période gardée par le dépôt en mémoire. */
export interface StoredPeriod {
  readonly id: string;
  readonly companyId: string;
  readonly declaredAt: Date;
  readonly declaredBy: string;
  withdrawnAt: Date | null;
  withdrawnBy: string | null;
}

/** Le dépôt en mémoire : un historique, comme la table ; il compte les écritures. */
export class InMemoryInHousePayers extends InHousePayerRepository {
  readonly periods: StoredPeriod[] = [];
  saves = 0;
  load(companyId: string): Promise<InHousePayer> {
    return Promise.resolve(InHousePayer.reconstitute(companyId, this.liveOf(companyId) ?? null));
  }
  save(payer: InHousePayer): Promise<void> {
    this.saves += 1;
    const withdrawal = payer.withdrawal;
    const closing = this.periods.find((period) => period.id === withdrawal?.declarationId);
    if (withdrawal !== null && closing !== undefined) {
      closing.withdrawnAt = withdrawal.withdrawnAt;
      closing.withdrawnBy = withdrawal.withdrawnBy;
    }
    if (payer.opened !== null) {
      this.periods.push({
        ...payer.opened,
        companyId: payer.companyId,
        withdrawnAt: null,
        withdrawnBy: null,
      });
    }
    return Promise.resolve();
  }
  /** La période vivante d'une société. */
  liveOf(companyId: string): StoredPeriod | undefined {
    return this.periods.find((p) => p.companyId === companyId && p.withdrawnAt === null);
  }
}
