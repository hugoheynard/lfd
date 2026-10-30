import { PRO_ANONYMOUS_VIEWER, proViewer, PUBLIC_VIEWER } from "../../domain/catalog-viewer.js";
import { accessOf, type AccessRow } from "../catalog-item-access.js";

/**
 * La ligne lue → le verdict du mur : `_count` dit « réservé », la relation
 * filtrée dit « à moi », la décision locale dit la visibilité et le marqueur.
 */
function row(over: Partial<AccessRow> = {}): AccessRow {
  return {
    audience: "both",
    publicReviewPending: false,
    proReviewPending: false,
    override: null,
    _count: { reservations: 0 },
    reservations: [],
    ...over,
  };
}

const OVERRIDE = {
  isHidden: false,
  isHiddenPublic: false,
  isMadeToOrder: false,
  reservedVisibility: "visible_locked",
};
const B_LOCKED = proViewer({ companyId: "co_b", activePrincipalId: null }, "served_and_locked");
const A = proViewer({ companyId: "co_a", activePrincipalId: null });

describe("accessOf", () => {
  it("sans décision locale ni réservation : servi à tous, sans étiquette", () => {
    expect(accessOf(row(), PUBLIC_VIEWER)).toEqual({ verdict: "served", mark: "none" });
  });

  it("réservé ailleurs, `visible_locked` : verrouillé pour B, absent pour l'anonyme", () => {
    const reserved = row({ override: OVERRIDE, _count: { reservations: 1 } });
    expect(accessOf(reserved, B_LOCKED)).toEqual({ verdict: "locked", mark: "other" });
    expect(accessOf(reserved, PRO_ANONYMOUS_VIEWER).verdict).toBe("absent");
  });

  it("réservé à A et lu par A : servi, étiqueté « à moi »", () => {
    const reserved = row({ _count: { reservations: 2 }, reservations: [{ companyId: "co_a" }] });
    expect(accessOf(reserved, A)).toEqual({ verdict: "served", mark: "mine" });
  });

  it("sans ligne de décision, la visibilité vaut `hidden`, le défaut de la base", () => {
    const reserved = row({ _count: { reservations: 1 } });
    expect(accessOf(reserved, B_LOCKED).verdict).toBe("absent");
  });

  it("le marqueur sur mesure ferme le public (S3, Q5)", () => {
    const madeToOrder = row({ override: { ...OVERRIDE, isMadeToOrder: true } });
    expect(accessOf(madeToOrder, PUBLIC_VIEWER).verdict).toBe("absent");
    expect(accessOf(madeToOrder, PRO_ANONYMOUS_VIEWER).verdict).toBe("served");
  });
});
