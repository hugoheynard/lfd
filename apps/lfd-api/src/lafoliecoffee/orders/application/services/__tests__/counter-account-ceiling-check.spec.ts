import { CounterAccountCeilingExceededError } from "../../../domain/errors/counter-account-ceiling.error.js";
import { CounterAccountCeilingReader } from "../../../domain/ports/counter-account-ceiling.reader.js";
import { CounterAccountOutstandingReader } from "../../../domain/ports/counter-account-outstanding.reader.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import { CounterAccountCeilingCheck } from "../counter-account-ceiling-check.js";

class FixedStatus extends CompanyStatusReader {
  constructor(private readonly status: OrderCompanyStatus) {
    super();
  }
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(this.status);
  }
}

class FixedCeiling extends CounterAccountCeilingReader {
  constructor(private readonly cents: number | null) {
    super();
  }
  ceilingCents(): Promise<number | null> {
    return Promise.resolve(this.cents);
  }
}

/** Retient les lots demandés : l'encours n'est lu que s'il le faut. */
class RecordingOutstanding extends CounterAccountOutstandingReader {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly owed: ReadonlyMap<string, number>) {
    super();
  }
  outstandingOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    this.asked.push(companyIds);
    return Promise.resolve(this.owed);
  }
}

function check(status: OrderCompanyStatus, ceiling: number | null, owed = 0) {
  const outstanding = new RecordingOutstanding(new Map([["co_1", owed]]));
  return {
    outstanding,
    check: new CounterAccountCeilingCheck(
      new FixedStatus(status),
      new FixedCeiling(ceiling),
      outstanding,
    ),
  };
}

const ON_ACCOUNT = {
  companyId: "co_1",
  settlement: "account",
  totalCents: 20_000,
  counterAccountPath: true,
} as const;

describe("CounterAccountCeilingCheck", () => {
  it("refuse quand encours + commande passe le plafond, et nomme les montants", async () => {
    const refusal = await check("counter_opened", 40_000, 30_000).check.refusalFor(ON_ACCOUNT);
    expect(refusal).toBeInstanceOf(CounterAccountCeilingExceededError);
    expect(refusal).toMatchObject({
      outstandingCents: 30_000,
      totalCents: 20_000,
      ceilingCents: 40_000,
    });
    expect(refusal?.message).toContain("Convertissez le compte");
    expect(refusal?.message).toContain("par carte");
  });

  it("admet sous le plafond", async () => {
    expect(await check("counter_opened", 60_000, 30_000).check.refusalFor(ON_ACCOUNT)).toBeNull();
  });

  it("ne lit pas l'encours quand aucun plafond n'est posé", async () => {
    const world = check("counter_opened", null, 1_000_000);
    expect(await world.check.refusalFor(ON_ACCOUNT)).toBeNull();
    expect(world.outstanding.asked).toEqual([]);
  });

  it("ne juge pas une société active", async () => {
    const world = check("active", 0, 1_000_000);
    expect(await world.check.refusalFor(ON_ACCOUNT)).toBeNull();
    expect(world.outstanding.asked).toEqual([]);
  });

  it("ne juge pas un règlement par lien", async () => {
    expect(
      await check("counter_opened", 0, 1_000_000).check.refusalFor({
        ...ON_ACCOUNT,
        settlement: "link",
      }),
    ).toBeNull();
  });

  /**
   * Régression : la garde relisait le statut sur toute saisie au compte, et
   * l'estimation de la saisie a coûté une lecture de plus que son budget.
   */
  it("ne lit rien hors du chemin du comptoir", async () => {
    const world = check("counter_opened", 0, 1_000_000);
    expect(await world.check.refusalFor({ ...ON_ACCOUNT, counterAccountPath: false })).toBeNull();
    expect(world.outstanding.asked).toEqual([]);
  });

  it("lit l'encours d'un compte sans commande comme nul", async () => {
    const world = new CounterAccountCeilingCheck(
      new FixedStatus("counter_opened"),
      new FixedCeiling(20_000),
      new RecordingOutstanding(new Map()),
    );
    expect(await world.refusalFor(ON_ACCOUNT)).toBeNull();
  });
});
