import { ProductReadiness } from "../product-readiness.js";
import {
  AnonymousReadinessError,
  ProductNotDeclaredReadyError,
} from "../../errors/product-errors.js";
import { ProductChangedAfterReadinessError } from "../../errors/product-readiness-errors.js";

const AT = new Date("2026-08-31T09:00:00.000Z");

describe("ProductReadiness", () => {
  it("naît sans signature", () => {
    expect(ProductReadiness.unsigned("prd_1").signature).toBeNull();
  });

  it("inscrit la date et l'auteur de la déclaration", () => {
    const readiness = ProductReadiness.unsigned("prd_1");

    readiness.declare(AT, "staff_hugo", new Date(AT.getTime() - 1000));

    expect(readiness.signature).toEqual({ readyAt: AT, readyBy: "staff_hugo" });
  });

  it("remplace la signature d'un autre par la nouvelle", () => {
    const readiness = ProductReadiness.signed("prd_1", {
      readyAt: new Date(AT.getTime() - 60_000),
      readyBy: "staff_autre",
    });

    readiness.declare(AT, "staff_hugo", null);

    expect(readiness.signature).toEqual({ readyAt: AT, readyBy: "staff_hugo" });
  });

  it("accepte un contenu daté à l'instant même, et un contenu dont aucune date n'est connue", () => {
    expect(() => ProductReadiness.unsigned("prd_1").declare(AT, "staff_hugo", AT)).not.toThrow();
    expect(() => ProductReadiness.unsigned("prd_1").declare(AT, "staff_hugo", null)).not.toThrow();
  });

  it.each([null, ""])("refuse une signature anonyme (%j)", (by) => {
    const readiness = ProductReadiness.unsigned("prd_1");

    expect(() => readiness.declare(AT, by, null)).toThrow(AnonymousReadinessError);
    expect(readiness.signature).toBeNull();
  });

  it("refuse une fiche plus récente que sa preuve, et garde la signature d'avant", () => {
    const before = { readyAt: new Date(AT.getTime() - 60_000), readyBy: "staff_hugo" };
    const readiness = ProductReadiness.signed("prd_1", before);

    expect(() => readiness.declare(AT, "staff_hugo", new Date(AT.getTime() + 1))).toThrow(
      ProductChangedAfterReadinessError,
    );
    expect(readiness.signature).toEqual(before);
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
