import { bankRejectionFromRow, sequenceFromRow } from "../collection-batch-row.mapper.js";

const AT = new Date("2026-10-20T09:00:00.000Z");

describe("collection-batch-row.mapper — les colonnes relues par trois adaptateurs", () => {
  it("le rejet : les trois colonnes rendent le tampon", () => {
    expect(bankRejectionFromRow(AT, "staff_1", "PSR1 refusé")).toEqual({
      at: AT,
      staffId: "staff_1",
      reason: "PSR1 refusé",
    });
  });

  it.each([
    [null, "staff_1", "motif"],
    [AT, null, "motif"],
    [AT, "staff_1", null],
  ] as const)("le rejet : une colonne nulle, pas de tampon", (at, staffId, reason) => {
    expect(bankRejectionFromRow(at, staffId, reason)).toBeNull();
  });

  it("la séquence : RCUR et OOFF se relisent", () => {
    expect(sequenceFromRow("RCUR")).toBe("RCUR");
    expect(sequenceFromRow("OOFF")).toBe("OOFF");
  });

  it("la séquence : toute autre valeur est une ligne corrompue", () => {
    expect(() => sequenceFromRow("FRST")).toThrow(/ni RCUR ni OOFF/u);
  });
});
