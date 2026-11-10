import { occurrenceVerdict } from "../reserved-occurrence.js";

const OCCURRENCE = {
  date: "2026-11-02",
  companyName: "Hip Hideouts",
  lines: [
    { sku: "PAN-001", name: "Pain de mie" },
    { sku: "SUR-001", name: "Brioche signature" },
  ],
};

describe("occurrenceVerdict — Q7 : une échéance n'est jamais amputée en silence", () => {
  it("génère l'échéance quand tout reste ouvert au client", () => {
    expect(occurrenceVerdict({ ...OCCURRENCE, reservedElsewhere: new Set() })).toEqual({
      generate: true,
    });
  });

  it("ne la génère pas, et l'alerte nomme l'article, la date et la société", () => {
    const verdict = occurrenceVerdict({ ...OCCURRENCE, reservedElsewhere: new Set(["SUR-001"]) });
    const alert = verdict.generate ? null : verdict.alert;
    expect(alert).toContain(
      "Occurrence du 2026-11-02 non générée : Brioche signature (SUR-001) n'est plus réservé à Hip Hideouts",
    );
    expect(alert).not.toContain("Pain de mie");
  });
});
