import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { LateFeeSetting } from "../../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeRepository } from "../../domain/order-late-fee.repository.js";
import { SaveOrderLateFeeCommand } from "../order-late-fee.commands.js";
import { ClearOrderLateFeeHandler, SaveOrderLateFeeHandler } from "../order-late-fee.handlers.js";

/**
 * Les faits de la surtaxe de retard (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1,
 * 2026-09-19) : un fait par geste réel, l'avant et l'après.
 */
const FIVE_EUROS: LateFeeSetting = {
  adjustment: { mode: "amount", cents: 500 },
  vatRatePercent: 20,
};
const TEN_PERCENT: LateFeeSetting = {
  adjustment: { mode: "percent", bp: 1000 },
  vatRatePercent: 5.5,
};

/** Le réglage unique, en mémoire — et l'ordre de ce qu'on lui a fait. */
class InMemoryLateFee extends OrderLateFeeRepository {
  current: LateFeeSetting | null = null;
  readonly log: string[] = [];

  read(): Promise<LateFeeSetting | null> {
    this.log.push("read");
    return Promise.resolve(this.current);
  }

  save(setting: LateFeeSetting, updatedBy: string): Promise<void> {
    this.log.push(`save:${updatedBy}`);
    this.current = setting;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.log.push("clear");
    this.current = null;
    return Promise.resolve();
  }
}

function build() {
  const fees = new InMemoryLateFee();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  return {
    fees,
    events,
    save: new SaveOrderLateFeeHandler(fees, events, uow),
    clear: new ClearOrderLateFeeHandler(fees, events, uow),
  };
}

describe("SaveOrderLateFeeHandler", () => {
  it("journalise une première pose : pas d'avant, l'après dans l'unité de la colonne", async () => {
    const { save, events } = build();

    await save.execute(new SaveOrderLateFeeCommand(FIVE_EUROS, "fiche-1"));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "order_late_fee.set",
        subjectType: "order_late_fee",
        subjectId: "singleton",
        payload: {
          before: null,
          after: { fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 },
        },
      },
    ]);
  });

  it("lit l'avant AVANT d'écrire l'après", async () => {
    const { save, fees, events } = build();
    fees.current = FIVE_EUROS;

    await save.execute(new SaveOrderLateFeeCommand(TEN_PERCENT, "fiche-1"));

    expect(fees.log).toEqual(["read", "save:fiche-1"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      before: { fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 },
      after: { fee: { mode: "percent", bp: 1000 }, vatRatePercent: 5.5 },
    });
  });
});

describe("ClearOrderLateFeeHandler", () => {
  it("journalise le retrait avec ce que la surtaxe valait", async () => {
    const { clear, fees, events } = build();
    fees.current = FIVE_EUROS;

    await clear.execute();

    expect(fees.current).toBeNull();
    expect(events.factTypes()).toEqual(["order_late_fee.cleared"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      before: { fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 },
    });
  });

  /** Un fait « retirée » sur une surtaxe qui n'existait pas mentirait au lecteur. */
  it("retirer une surtaxe absente reste un succès, sans écriture ni fait", async () => {
    const { clear, fees, events } = build();

    await expect(clear.execute()).resolves.toBeUndefined();

    expect(fees.log).toEqual(["read"]);
    expect(events.traced).toHaveLength(0);
  });
});
