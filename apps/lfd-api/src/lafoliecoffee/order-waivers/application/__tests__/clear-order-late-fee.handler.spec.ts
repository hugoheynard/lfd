import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { ClearOrderLateFeeHandler } from "../clear-order-late-fee.handler.js";
import { FIVE_EUROS, InMemoryLateFee } from "./order-late-fee-doubles.js";

function build() {
  const fees = new InMemoryLateFee();
  const events = new RecordingPublisher();
  return {
    fees,
    events,
    clear: new ClearOrderLateFeeHandler(fees, events, new DirectUnitOfWork()),
  };
}

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
