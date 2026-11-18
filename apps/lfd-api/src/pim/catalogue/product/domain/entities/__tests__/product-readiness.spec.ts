import { ProductReadiness } from "../product-readiness.js";
import {
  AnonymousReadinessError,
  ProductNotDeclaredReadyError,
} from "../../errors/product-errors.js";

const AT = new Date("2026-08-31T09:00:00.000Z");

describe("ProductReadiness", () => {
  it("naît sans signature", () => {
    expect(ProductReadiness.unsigned("prd_1").signature).toBeNull();
  });

  it("inscrit la date et l'auteur de la déclaration", () => {
    const readiness = ProductReadiness.unsigned("prd_1");

    readiness.declare(AT, "staff_hugo");

    expect(readiness.signature).toEqual({ readyAt: AT, readyBy: "staff_hugo" });
  });

  it("remplace la signature d'un autre par la nouvelle", () => {
    const readiness = ProductReadiness.signed("prd_1", {
      readyAt: new Date(AT.getTime() - 60_000),
      readyBy: "staff_autre",
    });

    readiness.declare(AT, "staff_hugo");

    expect(readiness.signature).toEqual({ readyAt: AT, readyBy: "staff_hugo" });
  });

  it.each([null, ""])("refuse une signature anonyme (%j)", (by) => {
    const readiness = ProductReadiness.unsigned("prd_1");

    expect(() => readiness.declare(AT, by)).toThrow(AnonymousReadinessError);
    expect(readiness.signature).toBeNull();
  });

  it("retire la signature", () => {
    const readiness = ProductReadiness.signed("prd_1", { readyAt: AT, readyBy: "staff_hugo" });

    readiness.withdraw();

    expect(readiness.signature).toBeNull();
  });

  it("refuse de retirer une signature que personne n'a posée", () => {
    expect(() => ProductReadiness.unsigned("prd_1").withdraw()).toThrow(
      ProductNotDeclaredReadyError,
    );
  });
});
