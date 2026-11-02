import { PRO_ANONYMOUS_VIEWER, proViewer, PUBLIC_VIEWER } from "../../domain/catalog-viewer.js";
import { accessOf, type AccessRow } from "../catalog-item-access.js";

/**
 * La ligne lue → le verdict du mur : `_count` dit « réservé », la relation
 * filtrée dit « à moi », la décision locale dit la visibilité, et la colonne
 * de la fiche dit « sur mesure » (fil v17, § 13 — plus la ligne de décision).
 */
function row(over: Partial<AccessRow> = {}): AccessRow {
  return {
    audience: "both",
    publicReviewPending: false,
    proReviewPending: false,
    customRecipe: false,
    override: null,
    _count: { reservations: 0 },
    reservations: [],
    ...over,
  };
}

const OVERRIDE = {
  isHidden: false,
  isHiddenPublic: false,
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

  it("sur mesure sans réservation : fermé au public (S3) et à tout pro (D3)", () => {
    const customRecipe = row({ customRecipe: true, override: OVERRIDE });
    expect(accessOf(customRecipe, PUBLIC_VIEWER).verdict).toBe("absent");
    expect(accessOf(customRecipe, PRO_ANONYMOUS_VIEWER).verdict).toBe("absent");
    expect(accessOf(customRecipe, A).verdict).toBe("absent");
  });

  it("sur mesure et réservé à A : servi à A seul", () => {
    const customRecipe = row({
      customRecipe: true,
      _count: { reservations: 1 },
      reservations: [{ companyId: "co_a" }],
    });
    expect(accessOf(customRecipe, A)).toEqual({ verdict: "served", mark: "mine" });
    expect(
      accessOf(row({ customRecipe: true, _count: { reservations: 1 } }), B_LOCKED).verdict,
    ).toBe("absent");
  });
});
