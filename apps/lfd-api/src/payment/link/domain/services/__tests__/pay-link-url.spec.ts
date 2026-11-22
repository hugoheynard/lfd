import { payLinkUrl } from "../pay-link-url.js";

describe("payLinkUrl", () => {
  it("compose <racine>/payer/<jeton>", () => {
    expect(payLinkUrl("https://app.lfc.test", "abc_-1")).toBe("https://app.lfc.test/payer/abc_-1");
  });

  it("ne double pas la barre d'une racine qui en finit par une ou plusieurs", () => {
    expect(payLinkUrl("https://app.lfc.test//", "t")).toBe("https://app.lfc.test/payer/t");
  });
});
