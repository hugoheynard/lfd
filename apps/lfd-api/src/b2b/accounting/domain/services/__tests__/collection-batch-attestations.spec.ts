import {
  standingAttestationOf,
  type BatchAttestationLine,
} from "../collection-batch-attestations.js";

/** La règle de lecture : la dernière ligne d'un (lot, sorte) fait foi. */

const AT = new Date("2026-11-13T09:00:00.000Z");

function line(id: string, over: Partial<BatchAttestationLine> = {}): BatchAttestationLine {
  return {
    id,
    batchId: "b1",
    kind: "remittance_signed",
    at: AT,
    staffId: "s",
    withdrawn: false,
    ...over,
  };
}

describe("standingAttestationOf", () => {
  it("rien : null", () => {
    expect(standingAttestationOf([], "psr_read")).toBeNull();
  });

  it("la plus récente par l'instant, quel que soit l'ordre reçu", () => {
    const later = line("a0", { at: new Date(AT.getTime() + 1000), withdrawn: true });
    expect(standingAttestationOf([later, line("a1")], "remittance_signed")).toBeNull();
  });

  it("à instant égal, l'identifiant (ULID) départage", () => {
    const lines = [line("a2", { withdrawn: true }), line("a3")];
    expect(standingAttestationOf(lines, "remittance_signed")?.id).toBe("a3");
  });

  it("une sorte ne se lit pas dans les lignes d'une autre", () => {
    const lines = [line("a1"), line("a2", { kind: "psr_read", withdrawn: true })];
    expect(standingAttestationOf(lines, "remittance_signed")?.id).toBe("a1");
    expect(standingAttestationOf(lines, "psr_read")).toBeNull();
  });
});
