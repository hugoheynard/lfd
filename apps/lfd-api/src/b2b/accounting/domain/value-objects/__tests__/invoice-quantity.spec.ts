import { InvalidInvoiceQuantityError } from "../../errors/invoice-errors.js";
import { InvoiceQuantity } from "../invoice-quantity.js";

describe("InvoiceQuantity", () => {
  it("porte une quantité entière de pièces, en millièmes", () => {
    const quantity = InvoiceQuantity.units(12, "H87");
    expect(quantity.thousandths).toBe(12_000);
    expect(quantity.toDecimalString()).toBe("12");
  });

  it("admet des décimales au kilogramme, sans flottant", () => {
    expect(InvoiceQuantity.ofThousandths(1_250, "KGM").toDecimalString()).toBe("1.25");
    expect(InvoiceQuantity.ofThousandths(5, "KGM").toDecimalString()).toBe("0.005");
  });

  it("refuse une demi-pièce : une pièce se compte en entiers", () => {
    expect(() => InvoiceQuantity.ofThousandths(1_500, "H87")).toThrow(InvalidInvoiceQuantityError);
  });

  it.each([0, -1_000, 1.5])("refuse %d millièmes", (thousandths) => {
    expect(() => InvoiceQuantity.ofThousandths(thousandths, "KGM")).toThrow(
      InvalidInvoiceQuantityError,
    );
  });

  it("refuse un nombre d'unités non entier", () => {
    expect(() => InvoiceQuantity.units(1.5, "KGM")).toThrow(InvalidInvoiceQuantityError);
  });
});
