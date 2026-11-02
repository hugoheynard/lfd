import {
  keptLinesViewer,
  PRO_ANONYMOUS_VIEWER,
  proViewer,
  PUBLIC_VIEWER,
  staffViewer,
  type CatalogViewer,
} from "../catalog-viewer.js";
import type { ServableItem } from "../served-to.js";
import {
  reservationMarkOf,
  servedToViewer,
  type ItemReservation,
  type ViewerVerdict,
} from "../served-to-viewer.js";

/**
 * La table de vérité du mur (`plan-articles-sur-mesure.md`, § 9) : public,
 * pro anonyme, pro dans R, site dont le principal est dans R, autre pro ×
 * `hidden` / `visible_locked`, personnel.
 */

const A = "co_a";
const SITE_OF_A = "co_site_a";
const B = "co_b";

/** Un article en vente aux deux audiences, réservé ou non. */
function item(over: Partial<ServableItem> = {}): ServableItem {
  return {
    audience: "both",
    isHidden: false,
    isHiddenPublic: false,
    publicReviewPending: false,
    proReviewPending: false,
    isReserved: true,
    isCustomRecipe: false,
    ...over,
  };
}

/** Ce que la lecture rend pour ce lecteur : les réservataires parmi SES sociétés. */
function reservedTo(
  viewer: CatalogViewer,
  holders: readonly string[],
  visibility: ItemReservation["visibility"],
): ItemReservation {
  const mine =
    viewer.kind === "pro"
      ? [viewer.holders.companyId, viewer.holders.activePrincipalId]
      : viewer.kind === "staff" && viewer.regarding !== null
        ? [viewer.regarding.companyId, viewer.regarding.activePrincipalId]
        : [];
  return { heldBy: holders.filter((id) => mine.includes(id)), visibility };
}

const PRO_A = proViewer({ companyId: A, activePrincipalId: null });
const SITE_A = proViewer({ companyId: SITE_OF_A, activePrincipalId: A });
const SITE_A_SUSPENDED_PRINCIPAL = proViewer({ companyId: SITE_OF_A, activePrincipalId: null });
const PRO_B = proViewer({ companyId: B, activePrincipalId: null });
const PRO_B_LOCKED = proViewer({ companyId: B, activePrincipalId: null }, "served_and_locked");
const STAFF = staffViewer("pro");

describe("servedToViewer — un article réservé à A", () => {
  it.each<[string, CatalogViewer, ViewerVerdict, ViewerVerdict]>([
    // lecteur, verdict `hidden`, verdict `visible_locked`
    ["le public (S3)", PUBLIC_VIEWER, "absent", "absent"],
    ["le pro anonyme (Q2)", PRO_ANONYMOUS_VIEWER, "absent", "absent"],
    ["A lui-même (S1)", PRO_A, "served", "served"],
    ["un site dont A est le principal actif (S1, Q3)", SITE_A, "served", "served"],
    ["un site dont le principal est suspendu (Q8)", SITE_A_SUSPENDED_PRINCIPAL, "absent", "absent"],
    ["B, lecteur ordinaire (S7)", PRO_B, "absent", "absent"],
    ["B, rayon reconnu ou habituels (S2, S7)", PRO_B_LOCKED, "absent", "locked"],
    ["le personnel (S5)", STAFF, "served", "served"],
  ])("%s", (_label, viewer, whenHidden, whenLocked) => {
    expect(servedToViewer(item(), reservedTo(viewer, [A], "hidden"), viewer)).toBe(whenHidden);
    expect(servedToViewer(item(), reservedTo(viewer, [A], "visible_locked"), viewer)).toBe(
      whenLocked,
    );
  });

  it("réservé à un SITE : n'ouvre pas son principal (Q3)", () => {
    const reservation = reservedTo(PRO_A, [SITE_OF_A], "hidden");
    expect(servedToViewer(item(), reservation, PRO_A)).toBe("absent");
  });

  it("les lignes gardées d'une révision lèvent la réservation (§ 5)", () => {
    const viewer = keptLinesViewer({ companyId: B, activePrincipalId: null });
    expect(servedToViewer(item(), reservedTo(viewer, [A], "hidden"), viewer)).toBe("served");
    expect(reservationMarkOf(item(), reservedTo(viewer, [A], "hidden"), viewer)).toBe("mine");
  });

  it("la réservation n'ouvre pas ce que l'audience, le masquage ou la validation ferment", () => {
    const closed = [
      item({ audience: "public" }),
      item({ isHidden: true }),
      item({ proReviewPending: true }),
    ];
    for (const article of closed) {
      expect(servedToViewer(article, reservedTo(PRO_A, [A], "hidden"), PRO_A)).toBe("absent");
      expect(servedToViewer(article, reservedTo(STAFF, [A], "hidden"), STAFF)).toBe("absent");
    }
  });
});

describe("servedToViewer — sans réservation", () => {
  const open = item({ isReserved: false });

  it("rien ne change : servi à tous les pros et au public", () => {
    for (const viewer of [PUBLIC_VIEWER, PRO_ANONYMOUS_VIEWER, PRO_A, PRO_B_LOCKED, STAFF]) {
      expect(servedToViewer(open, reservedTo(viewer, [], "hidden"), viewer)).toBe("served");
    }
  });

  it("le personnel lisant le public applique S3 aussi", () => {
    const viewer = staffViewer("public");
    expect(servedToViewer(item(), reservedTo(viewer, [A], "hidden"), viewer)).toBe("absent");
  });
});

/**
 * **D3 — la table de vérité du sur mesure** (`plan-articles-sur-mesure.md`
 * § 13.2, 13.6) : sur mesure × réservation × lecteur. S4 (« ouvert à tous les
 * pros ») est remplacée : sans réservation, aucun pro ne le voit. Le personnel
 * et les lignes gardées d'une révision passent AVANT la règle (bloquant 1).
 */
describe("servedToViewer — un article sur mesure (D3)", () => {
  const KEPT_B = keptLinesViewer({ companyId: B, activePrincipalId: null });
  const STAFF_PUBLIC = staffViewer("public");

  it.each<[string, CatalogViewer, ViewerVerdict, ViewerVerdict, ViewerVerdict]>([
    // lecteur, sans réservation, réservé à A `hidden`, réservé à A `visible_locked`
    ["le public (S3)", PUBLIC_VIEWER, "absent", "absent", "absent"],
    ["le pro anonyme (D3, Q2)", PRO_ANONYMOUS_VIEWER, "absent", "absent", "absent"],
    ["A lui-même (D3, S1)", PRO_A, "absent", "served", "served"],
    ["un site dont A est le principal actif", SITE_A, "absent", "served", "served"],
    ["un site au principal suspendu", SITE_A_SUSPENDED_PRINCIPAL, "absent", "absent", "absent"],
    ["B, lecteur ordinaire", PRO_B, "absent", "absent", "absent"],
    ["B, rayon reconnu ou habituels", PRO_B_LOCKED, "absent", "absent", "locked"],
    ["le personnel, tarif pro (S5)", STAFF, "served", "served", "served"],
    ["le personnel, étiquette publique (S3)", STAFF_PUBLIC, "absent", "absent", "absent"],
    ["les lignes gardées de B (waiveReservation)", KEPT_B, "served", "served", "served"],
  ])("%s", (_label, viewer, unattributed, whenHidden, whenLocked) => {
    const custom = (isReserved: boolean): ServableItem =>
      item({ isReserved, isCustomRecipe: true });
    expect(servedToViewer(custom(false), reservedTo(viewer, [], "hidden"), viewer)).toBe(
      unattributed,
    );
    expect(servedToViewer(custom(true), reservedTo(viewer, [A], "hidden"), viewer)).toBe(
      whenHidden,
    );
    expect(servedToViewer(custom(true), reservedTo(viewer, [A], "visible_locked"), viewer)).toBe(
      whenLocked,
    );
  });

  it("un article ouvert, non sur mesure, reste servi à tous les pros (rien ne change)", () => {
    const open = item({ isReserved: false, isCustomRecipe: false });
    for (const viewer of [PRO_ANONYMOUS_VIEWER, PRO_A, PRO_B, KEPT_B]) {
      expect(servedToViewer(open, reservedTo(viewer, [], "hidden"), viewer)).toBe("served");
    }
  });

  it("le sur mesure n'ouvre pas ce que la validation pro ferme (13.6-7)", () => {
    const pending = item({ isCustomRecipe: true, proReviewPending: true });
    expect(servedToViewer(pending, reservedTo(PRO_A, [A], "hidden"), PRO_A)).toBe("absent");
    expect(servedToViewer(pending, reservedTo(STAFF, [A], "hidden"), STAFF)).toBe("absent");
  });
});

describe("reservationMarkOf — l'étiquette", () => {
  it.each<[string, CatalogViewer, ReturnType<typeof reservationMarkOf>]>([
    ["A", PRO_A, "mine"],
    ["le site de A", SITE_A, "mine"],
    ["B verrouillé", PRO_B_LOCKED, "other"],
    ["le personnel sans compte", STAFF, "reserved"],
    [
      "le personnel au nom de A",
      staffViewer("pro", { companyId: A, activePrincipalId: null }),
      "mine",
    ],
    [
      "le personnel au nom de B",
      staffViewer("pro", { companyId: B, activePrincipalId: null }),
      "other",
    ],
  ])("%s", (_label, viewer, mark) => {
    expect(reservationMarkOf(item(), reservedTo(viewer, [A], "visible_locked"), viewer)).toBe(mark);
  });

  it("un article ouvert n'a pas d'étiquette", () => {
    expect(
      reservationMarkOf(item({ isReserved: false }), reservedTo(PRO_B, [], "hidden"), PRO_B),
    ).toBe("none");
  });
});
