import { InHousePayer } from "../in-house-payer.js";
import {
  InHouseAcrossBillingFollowError,
  InHousePublicPayerError,
} from "../../errors/in-house-payer-errors.js";

/** Les dates ne sont comparées qu'entre elles : aucune horloge n'est lue. */
const AT = new Date("2030-03-01T08:00:00.000Z");
const ALONE = { principalInHouse: null, sitesInHouse: [] } as const;
const PRIVATE = { isPublic: false } as const;

/** Le côté nommé par le refus, ou `null` si le geste passe. */
function sideOf(gesture: () => unknown): string | null {
  try {
    gesture();
    return null;
  } catch (error) {
    return error instanceof InHouseAcrossBillingFollowError ? error.side : "autre";
  }
}

function declared(): InHousePayer {
  return InHousePayer.reconstitute("resto", { id: "p1", declaredAt: AT, declaredBy: "staff_1" });
}

describe("InHousePayer — la nature « maison » d'un payeur", () => {
  it("marquer un payeur seul pose l'instant et l'auteur", () => {
    const payer = InHousePayer.reconstitute("resto", null);

    expect(
      payer.declare({ company: PRIVATE, neighbours: ALONE, at: AT, id: "p1", by: "staff_1" }),
    ).toBe(true);
    expect(payer.isInHouse).toBe(true);
    expect(payer.opened).toEqual({ id: "p1", declaredAt: AT, declaredBy: "staff_1" });
  });

  it("marquer ce qui l'est déjà ne change rien, pas même l'auteur", () => {
    const payer = declared();

    expect(
      payer.declare({ company: PRIVATE, neighbours: ALONE, id: "p2", at: AT, by: "staff_2" }),
    ).toBe(false);
    expect(payer.declaration?.declaredBy).toBe("staff_1");
  });

  it("refuse un organisme public", () => {
    const payer = InHousePayer.reconstitute("mairie", null);

    expect(() =>
      payer.declare({
        company: { isPublic: true },
        neighbours: ALONE,
        id: "p1",
        at: AT,
        by: "staff_1",
      }),
    ).toThrow(InHousePublicPayerError);
    expect(payer.isInHouse).toBe(false);
  });

  it("refuse de marquer un site qui suit la facturation d'un principal non maison", () => {
    const payer = InHousePayer.reconstitute("site", null);
    const neighbours = { principalInHouse: false, sitesInHouse: [] };

    expect(
      sideOf(() => payer.declare({ company: PRIVATE, neighbours, id: "p1", at: AT, by: "s" })),
    ).toBe("principal");
  });

  it("refuse de marquer un principal dont un site suit la facturation sans être maison", () => {
    const payer = InHousePayer.reconstitute("groupe", null);
    const neighbours = { principalInHouse: null, sitesInHouse: [true, false] };

    expect(() =>
      payer.declare({ company: PRIVATE, neighbours, id: "p1", at: AT, by: "s" }),
    ).toThrow(InHouseAcrossBillingFollowError);
  });

  it("marque un site dont le principal suivi est maison", () => {
    const payer = InHousePayer.reconstitute("site", null);
    const neighbours = { principalInHouse: true, sitesInHouse: [] };

    expect(payer.declare({ company: PRIVATE, neighbours, id: "p1", at: AT, by: "s" })).toBe(true);
  });

  it("démarquer clôt la période vivante, sans l'effacer", () => {
    const payer = declared();

    expect(payer.withdraw({ neighbours: ALONE, at: AT, by: "staff_2" })).toBe(true);
    expect(payer.declaration).toBeNull();
    expect(payer.withdrawal).toEqual({
      declarationId: "p1",
      withdrawnAt: AT,
      withdrawnBy: "staff_2",
    });
  });

  it("démarquer ce qui ne l'est pas ne change rien", () => {
    expect(
      InHousePayer.reconstitute("resto", null).withdraw({ neighbours: ALONE, at: AT, by: "s" }),
    ).toBe(false);
  });

  it("refuse de démarquer un principal dont les sites maison le suivent", () => {
    const payer = declared();

    expect(
      sideOf(() =>
        payer.withdraw({
          neighbours: { principalInHouse: null, sitesInHouse: [true] },
          at: AT,
          by: "s",
        }),
      ),
    ).toBe("sites");
    expect(payer.isInHouse).toBe(true);
  });
});
