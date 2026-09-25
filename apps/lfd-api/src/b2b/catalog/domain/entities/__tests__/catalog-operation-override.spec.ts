import { InvalidOperationOverrideError } from "../../errors/catalog-operation-errors.js";
import {
  CatalogOperationOverride,
  type OperationRestriction,
} from "../catalog-operation-override.js";

const AT = new Date("2026-09-24T10:00:00.000Z");
const LATER = new Date("2026-09-25T10:00:00.000Z");

const restriction = (over: Partial<OperationRestriction> = {}): OperationRestriction => ({
  isHidden: false,
  orderUntil: null,
  audience: null,
  hiddenSkus: [],
  ...over,
});

describe("la surcharge d'une opération reçue", () => {
  it("pose une décision, son auteur et sa date", () => {
    const override = CatalogOperationOverride.decide(
      "noel-2026",
      restriction({ audience: "pro", hiddenSkus: ["PAT-9-1"] }),
      "staff_1",
      AT,
    );

    expect(override.toPersistence()).toEqual({
      operationKey: "noel-2026",
      restriction: { isHidden: false, orderUntil: null, audience: "pro", hiddenSkus: ["PAT-9-1"] },
      decidedBy: "staff_1",
      decidedAt: AT,
    });
  });

  it("refuse un article retiré deux fois", () => {
    expect(() =>
      CatalogOperationOverride.decide(
        "noel-2026",
        restriction({ hiddenSkus: ["PAT-9-1", "PAT-9-1"] }),
        null,
        AT,
      ),
    ).toThrow(InvalidOperationOverrideError);
  });

  it("refuse un SKU vide", () => {
    expect(() =>
      CatalogOperationOverride.decide("noel-2026", restriction({ hiddenSkus: [" "] }), null, AT),
    ).toThrow(InvalidOperationOverrideError);
  });

  it("refuse une clôture illisible", () => {
    expect(() =>
      CatalogOperationOverride.decide(
        "noel-2026",
        restriction({ orderUntil: new Date("pas une date") }),
        null,
        AT,
      ),
    ).toThrow(InvalidOperationOverrideError);
  });

  /** D9 : la surcharge ne se confronte pas au référentiel — un SKU inconnu passe. */
  it("accepte de retirer un article que le miroir ne porte pas", () => {
    expect(() =>
      CatalogOperationOverride.decide(
        "noel-2026",
        restriction({ hiddenSkus: ["INCONNU-1"] }),
        null,
        AT,
      ),
    ).not.toThrow();
  });

  it("redécide : l'auteur et la date suivent le nouveau geste", () => {
    const override = CatalogOperationOverride.decide("noel-2026", restriction(), "staff_1", AT);

    expect(override.redecide(restriction({ isHidden: true }), "staff_2", LATER)).toBe(true);
    expect(override.toPersistence()).toMatchObject({ decidedBy: "staff_2", decidedAt: LATER });
  });

  it("ne dit rien changé quand la décision est réenregistrée à l'identique", () => {
    const orderUntil = new Date("2026-12-19T17:00:00.000Z");
    const override = CatalogOperationOverride.decide(
      "noel-2026",
      restriction({ orderUntil }),
      "staff_1",
      AT,
    );

    const changed = override.redecide(
      restriction({ orderUntil: new Date(orderUntil.getTime()) }),
      "staff_2",
      LATER,
    );

    expect(changed).toBe(false);
    expect(override.toPersistence()).toMatchObject({ decidedBy: "staff_1", decidedAt: AT });
  });

  it("lever la restriction reste une décision — la ligne demeure", () => {
    const override = CatalogOperationOverride.decide(
      "noel-2026",
      restriction({ isHidden: true }),
      "staff_1",
      AT,
    );

    expect(override.redecide(restriction(), "staff_1", LATER)).toBe(true);
    expect(override.restriction).toEqual(restriction());
  });
});
