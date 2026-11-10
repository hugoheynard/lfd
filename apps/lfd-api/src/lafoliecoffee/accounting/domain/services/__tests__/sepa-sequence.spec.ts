import { SEQUENCE_ORDER, sequenceTypeFrom, sequenceTypeOf } from "../sepa-sequence.js";

describe("sepa-sequence — la séquence d'un lot réel", () => {
  it.each(SEQUENCE_ORDER)("relit %s", (sequence) => {
    expect(sequenceTypeFrom(sequence)).toBe(sequence);
  });

  it.each(["FRST", "FNAL", "rcur", ""])(
    "refuse « %s » : null, jamais une séquence devinée",
    (raw) => {
      expect(sequenceTypeFrom(raw)).toBeNull();
    },
  );

  it("tire la séquence du type de paiement du mandat", () => {
    expect(sequenceTypeOf("recurrent")).toBe("RCUR");
    expect(sequenceTypeOf("one_off")).toBe("OOFF");
  });
});
