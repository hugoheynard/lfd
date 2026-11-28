import { CounterAccountOrderCountReader } from "../../../../orders/domain/ports/counter-account-order-count.reader.js";
import { CounterAccountOutstandingReader } from "../../../../orders/domain/ports/counter-account-outstanding.reader.js";
import {
  CounterOpenedAccountsReader,
  type CounterOpenedAccountRecord,
} from "../../../domain/ports/counter-opened-accounts.reader.js";
import { ListCounterOpenedAccountsHandler } from "../list-counter-opened-accounts.handler.js";
import { counterFiche, FixedFiches } from "./counter-account-fiche.js";

// Comparées à rien d'autre qu'elles-mêmes : la page les recopie.
const OPENED_AT = new Date("2026-08-07T09:00:00.000Z");

function record(
  companyId: string,
  overrides: Partial<CounterOpenedAccountRecord> = {},
): CounterOpenedAccountRecord {
  return {
    companyId,
    reference: `C-${companyId}`,
    enseigne: `Enseigne ${companyId}`,
    contact: { firstName: "Camille", lastName: "Rousseau", email: "c@k.test", phone: "06" },
    openedAt: OPENED_AT,
    openedByStaffId: "staff_lea",
    openedByName: "Léa Martin",
    identityCheck: { seen: true, byStaffId: "staff_lea", at: OPENED_AT },
    ...overrides,
  };
}

class FixedAccounts extends CounterOpenedAccountsReader {
  constructor(private readonly records: readonly CounterOpenedAccountRecord[]) {
    super();
  }
  listOpened(): Promise<readonly CounterOpenedAccountRecord[]> {
    return Promise.resolve(this.records);
  }
}

/** Une lecture par lot doublée : garde chaque lot demandé. */
class FixedOutstanding extends CounterAccountOutstandingReader {
  readonly batches: (readonly string[])[] = [];
  constructor(private readonly owed: ReadonlyMap<string, number>) {
    super();
  }
  outstandingOf(ids: readonly string[]): Promise<ReadonlyMap<string, number>> {
    this.batches.push(ids);
    return Promise.resolve(this.owed);
  }
}

class FixedCounts extends CounterAccountOrderCountReader {
  readonly batches: (readonly string[])[] = [];
  constructor(private readonly counts: ReadonlyMap<string, number>) {
    super();
  }
  countOf(ids: readonly string[]): Promise<ReadonlyMap<string, number>> {
    this.batches.push(ids);
    return Promise.resolve(this.counts);
  }
}

function world(records: readonly CounterOpenedAccountRecord[]) {
  const fiches = new FixedFiches(
    new Map([
      ["k1", counterFiche("k1", { siret: "", raisonSociale: "" })],
      ["k2", counterFiche("k2")],
    ]),
  );
  const owed = new FixedOutstanding(new Map([["k1", 12_500]]));
  const counts = new FixedCounts(new Map([["k1", 2]]));
  const handler = new ListCounterOpenedAccountsHandler(
    new FixedAccounts(records),
    fiches,
    owed,
    counts,
  );
  return { handler, owed, counts };
}

describe("la page « Comptes du comptoir » (K5)", () => {
  it("compose chaque ligne : dû, commandes, ce qui manque, et le total", async () => {
    const w = world([record("k1"), record("k2")]);

    const view = await w.handler.execute();

    expect(view.totalOutstandingCents).toBe(12_500);
    expect(view.accounts[0]).toMatchObject({
      companyId: "k1",
      onAccountOrders: 2,
      outstandingCents: 12_500,
      missing: ["identite_legale"],
      convertsToActive: false,
      openedAt: OPENED_AT.toISOString(),
      identityCheck: { seen: true, byStaffId: "staff_lea", byName: "Léa Martin" },
    });
    // Sans commande : zéro, et rien ne manque — « Convertir » activera.
    expect(view.accounts[1]).toMatchObject({
      companyId: "k2",
      onAccountOrders: 0,
      outstandingCents: 0,
      missing: [],
      convertsToActive: true,
    });
  });

  it("lit le dû et les commandes en UN lot pour toute la page", async () => {
    const w = world([record("k1"), record("k2")]);

    await w.handler.execute();

    expect(w.owed.batches).toEqual([["k1", "k2"]]);
    expect(w.counts.batches).toEqual([["k1", "k2"]]);
  });

  it("ne nomme l'agent de la pièce que s'il est celui qui a ouvert", async () => {
    const w = world([
      record("k1", { identityCheck: { seen: false, byStaffId: "staff_autre", at: OPENED_AT } }),
      record("k2", { identityCheck: null }),
    ]);

    const view = await w.handler.execute();

    expect(view.accounts[0]?.identityCheck).toMatchObject({ seen: false, byName: null });
    expect(view.accounts[1]?.identityCheck).toBeNull();
  });

  it("une fiche disparue entre-temps ne promet pas une activation", async () => {
    const w = world([record("k_gone")]);

    const view = await w.handler.execute();

    expect(view.accounts[0]).toMatchObject({ missing: [], convertsToActive: false });
  });

  it("une page vide rend un total nul", async () => {
    const view = await world([]).handler.execute();

    expect(view).toEqual({ accounts: [], totalOutstandingCents: 0 });
  });
});
