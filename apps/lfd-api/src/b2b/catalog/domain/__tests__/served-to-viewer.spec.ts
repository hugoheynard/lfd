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
    isMadeToOrder: false,
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

  it("sur mesure sans réservation : tous les pros, jamais le public (S4, S3)", () => {
    const madeToOrder = item({ isReserved: false, isMadeToOrder: true });
    expect(servedToViewer(madeToOrder, reservedTo(PRO_B, [], "hidden"), PRO_B)).toBe("served");
    expect(
      servedToViewer(
        madeToOrder,
        reservedTo(PRO_ANONYMOUS_VIEWER, [], "hidden"),
        PRO_ANONYMOUS_VIEWER,
      ),
    ).toBe("served");
    expect(
      servedToViewer(madeToOrder, reservedTo(PUBLIC_VIEWER, [], "hidden"), PUBLIC_VIEWER),
    ).toBe("absent");
  });

  it("le personnel lisant le public applique S3 aussi", () => {
    const viewer = staffViewer("public");
    expect(servedToViewer(item(), reservedTo(viewer, [A], "hidden"), viewer)).toBe("absent");
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
