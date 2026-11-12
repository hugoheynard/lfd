import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { InMemoryAudienceBatchLedger } from "../in-memory-audience-batch.ledger.js";

// Comparée à aucune date de la fixture : seul l'écart compte.
const START = new Date("2026-03-10T09:00:00.000Z");
const ELEVEN_MINUTES = 11 * 60 * 1_000;

describe("InMemoryAudienceBatchLedger", () => {
  it("réserve un lot une fois, refuse sa copie", () => {
    const ledger = new InMemoryAudienceBatchLedger(new FixedClock(START));
    expect(ledger.claim("b1")).toBe(true);
    expect(ledger.claim("b1")).toBe(false);
    expect(ledger.claim("b2")).toBe(true);
  });

  it("un lot rendu se réserve de nouveau", () => {
    const ledger = new InMemoryAudienceBatchLedger(new FixedClock(START));
    ledger.claim("b1");
    ledger.release("b1");
    expect(ledger.claim("b1")).toBe(true);
  });

  it("oublie un lot passé la fenêtre de rejeu", () => {
    const clock = new FixedClock(START);
    const ledger = new InMemoryAudienceBatchLedger(clock);
    ledger.claim("b1");
    clock.advanceMs(ELEVEN_MINUTES);
    expect(ledger.claim("b1")).toBe(true);
  });
});
