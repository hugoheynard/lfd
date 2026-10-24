import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { BrandLogoUnavailableError } from "../../../../../platform/brand/brand-logo-unavailable.error.js";
import {
  FixedLogo,
  FixedSheetOrigins,
  MissingLogo,
} from "../../services/__tests__/order-sheet-doubles.js";
import { GetOrderSheetSpecimenHandler } from "../get-order-sheet-specimen.handler.js";
import { GetOrderSheetSpecimenQuery } from "../get-order-sheet-specimen.query.js";

/** Le bon d'exemple, rendu par le rendu des vraies commandes — sans archive. */
const clock = new FixedClock(new Date());

describe("GetOrderSheetSpecimenHandler", () => {
  it.each(["pro", "public"] as const)("rend le bon %s en PDF, marqué EXEMPLE", async (variant) => {
    const handler = new GetOrderSheetSpecimenHandler(
      clock,
      new FixedLogo(),
      new FixedSheetOrigins("https://admin.lfc.test"),
    );

    const pdf = await handler.execute(new GetOrderSheetSpecimenQuery(variant));

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe(`exemple-confirmation-de-commande-${variant}.pdf`);
    expect(pdfPages(pdf.bytes).join(" ")).toContain("EXEMPLE");
  });

  it("dessine le QR du bon public : les octets diffèrent sans origine admin", async () => {
    const query = new GetOrderSheetSpecimenQuery("public");
    const withQr = await new GetOrderSheetSpecimenHandler(
      clock,
      new FixedLogo(),
      new FixedSheetOrigins("https://admin.lfc.test"),
    ).execute(query);
    const without = await new GetOrderSheetSpecimenHandler(
      clock,
      new FixedLogo(),
      new FixedSheetOrigins(null),
    ).execute(query);

    expect(withQr.bytes.equals(without.bytes)).toBe(false);
  });

  it("laisse passer le refus du logo manquant", async () => {
    const handler = new GetOrderSheetSpecimenHandler(
      clock,
      new MissingLogo(),
      new FixedSheetOrigins(null),
    );

    await expect(handler.execute(new GetOrderSheetSpecimenQuery("pro"))).rejects.toBeInstanceOf(
      BrandLogoUnavailableError,
    );
  });
});
