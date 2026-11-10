import { drawnText } from "../../../domain/services/__tests__/pdf-drawn-text.js";
import { GetSepaMandateSpecimenHandler } from "../get-sepa-mandate-specimen.handler.js";
import { GetSepaMandateSpecimenQuery } from "../get-sepa-mandate-specimen.query.js";

/** Le mandat d'exemple, rendu par le rendu des vrais mandats — sans frappe. */
describe("GetSepaMandateSpecimenHandler", () => {
  it.each(["B2B", "CORE"] as const)("rend le mandat %s en PDF, marqué EXEMPLE", async (scheme) => {
    const pdf = await new GetSepaMandateSpecimenHandler().execute(
      new GetSepaMandateSpecimenQuery(scheme),
    );

    expect(pdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.fileName).toBe(`exemple-mandat-sepa-${scheme.toLowerCase()}.pdf`);
    expect(drawnText(pdf.bytes)).toContain("EXEMPLE");
  });

  it("rend deux mises en page distinctes, une par schéma", async () => {
    const handler = new GetSepaMandateSpecimenHandler();

    const [b2b, core] = await Promise.all([
      handler.execute(new GetSepaMandateSpecimenQuery("B2B")),
      handler.execute(new GetSepaMandateSpecimenQuery("CORE")),
    ]);

    expect(b2b.bytes.equals(core.bytes)).toBe(false);
  });

  it("imprime le débiteur d'exemple, et non un client réel", async () => {
    const pdf = await new GetSepaMandateSpecimenHandler().execute(
      new GetSepaMandateSpecimenQuery("B2B"),
    );

    expect(drawnText(pdf.bytes)).toContain("SAS des Trois Ponts");
  });
});
