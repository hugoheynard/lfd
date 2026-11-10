import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { LateFeeSetting } from "../../../orders/domain/ports/order-late-fee.reader.js";
import { SaveOrderLateFeeCommand } from "../save-order-late-fee.command.js";
import { SaveOrderLateFeeHandler } from "../save-order-late-fee.handler.js";
import { FIVE_EUROS, InMemoryLateFee } from "./order-late-fee-doubles.js";

const TEN_PERCENT: LateFeeSetting = {
  adjustment: { mode: "percent", bp: 1000 },
  vatRatePercent: 5.5,
};

function build() {
  const fees = new InMemoryLateFee();
  const events = new RecordingPublisher();
  return { fees, events, save: new SaveOrderLateFeeHandler(fees, events, new DirectUnitOfWork()) };
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

  it("n'écrit aucun fait quand le réglage reposé est identique", async () => {
    const { save, fees, events } = build();
    fees.current = FIVE_EUROS;

    await save.execute(new SaveOrderLateFeeCommand({ ...FIVE_EUROS }, "fiche-2"));

    expect(fees.log).toEqual(["read", "save:fiche-2"]);
    expect(events.traced).toEqual([]);
  });

  it("journalise un changement de taux seul, montant inchangé", async () => {
    const { save, fees, events } = build();
    fees.current = FIVE_EUROS;

    await save.execute(new SaveOrderLateFeeCommand({ ...FIVE_EUROS, vatRatePercent: 5.5 }, "f"));

    expect(events.traced).toHaveLength(1);
  });

  it("journalise un changement de mode à valeur égale", async () => {
    const { save, fees, events } = build();
    fees.current = { adjustment: { mode: "amount", cents: 1000 }, vatRatePercent: 20 };

    await save.execute(
      new SaveOrderLateFeeCommand(
        { adjustment: { mode: "percent", bp: 1000 }, vatRatePercent: 20 },
        "f",
      ),
    );

    expect(events.traced).toHaveLength(1);
  });
});
