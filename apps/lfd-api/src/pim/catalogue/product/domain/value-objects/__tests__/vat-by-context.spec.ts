import { ProductUnknownContextError } from "../../errors/product-errors.js";
import type { SalesContext } from "../../../../../reference/sales-contexts/domain/value-objects/sales-context.js";
import { VatByContext } from "../vat-by-context.js";

const context = (key: string, position: number): SalesContext => ({
  id: `ctx-${key}`,
  key,
  label: key,
  active: true,
  position,
});
const CONTEXTS = [context("takeaway", 0), context("eat_in", 1)];

describe("VatByContext — la dérogation de TVA d'une fiche", () => {
  it("naît vide : la fiche suit sa famille", () => {
    expect(VatByContext.none().toMap()).toEqual({});
  });

  it("refuse une clé qui n'est pas au registre des contextes", () => {
    expect(() => VatByContext.declare({ nowhere: "vat-5-5" }, CONTEXTS)).toThrow(
      ProductUnknownContextError,
    );
  });

  it("ne garde pas la carte de l'appelant : on la copie", () => {
    const given = { takeaway: "vat-5-5" };
    const vat = VatByContext.declare(given, CONTEXTS);
    expect(vat.toMap()).toEqual(given);
    expect(vat.toMap()).not.toBe(given);
  });

  it("une carte vide est le retour à l'héritage", () => {
    expect(VatByContext.declare({}, CONTEXTS).toMap()).toEqual({});
  });

  it("la copie d'une dérogation ne partage pas sa carte", () => {
    const vat = VatByContext.reconstitute({ takeaway: "vat-5-5" });
    expect(vat.copy().toMap()).toEqual(vat.toMap());
    expect(vat.copy().toMap()).not.toBe(vat.toMap());
  });
});
