import { ImpossibleSiteResupplyStateError, UNGATED_PLACEMENT } from "../site-resupply-checks.js";
import { SiteResupply, type SiteResupplySnapshot } from "../site-resupply.js";
import { TooManySiteResupplyLinesError } from "../site-resupply-errors.js";
import { SITE_RESUPPLY_MAX_LINES } from "../site-resupply-lines.js";
import { draft, EVENING, line, trace } from "./site-resupply-fixtures.js";

/** Un brouillon tel que la base le rendrait, sans aucun geste. */
const DRAFT_ROW: SiteResupplySnapshot = {
  id: "rs1",
  siteId: "site_1",
  target: "asap",
  serviceDay: "2026-01-02",
  version: 1,
  origin: "counter",
  name: null,
  lines: [{ sku: "CRO", label: "Croissant", quantity: 12, saleUnit: "piece" }],
  placed: null,
  cancelled: null,
  arrived: null,
};

describe("SiteResupply — la relecture refuse un état impossible", () => {
  /**
   * Régression (audit final, 2026-11-03) : `restore` relisait sans broncher
   * un brouillon annulé ou arrivé, que l'agrégat présentait ensuite comme
   * « annulé » sans avoir jamais été envoyé.
   */
  it.each([
    ["annulé", { cancelled: trace(EVENING) }],
    ["arrivé", { arrived: trace(EVENING) }],
    ["lancé", { launched: { at: EVENING, byName: "Paul" } }],
    ["parti", { departed: { at: EVENING, byName: null } }],
  ] as const)("refuse un brouillon %s, en le nommant", (gesture, marks) => {
    expect(() => SiteResupply.restore({ ...DRAFT_ROW, ...marks })).toThrow(
      new ImpossibleSiteResupplyStateError("rs1", gesture),
    );
  });

  it("relit un brouillon sans geste, et un envoyé annulé", () => {
    expect(SiteResupply.restore(DRAFT_ROW).status).toBe("draft");
    const cancelled = { ...DRAFT_ROW, placed: trace(EVENING), cancelled: trace(EVENING) };
    expect(SiteResupply.restore(cancelled).status).toBe("cancelled");
  });
});

describe("SiteResupply — une demande a une borne", () => {
  /** Régression (audit final, 2026-11-03) : la demande du comptoir n'avait aucun plafond de lignes. */
  it("refuse l'article de trop, mais additionne encore un article déjà demandé", () => {
    const resupply = draft("asap");
    for (let index = 1; index < SITE_RESUPPLY_MAX_LINES; index += 1) {
      resupply.addLine(line(`SKU${String(index)}`, 1));
    }

    expect(() => resupply.addLine(line("ONE_TOO_MANY", 1))).toThrow(TooManySiteResupplyLinesError);
    resupply.addLine(line("CRO", 1));
    expect(resupply.lines).toHaveLength(SITE_RESUPPLY_MAX_LINES);
    resupply.place(trace(EVENING), UNGATED_PLACEMENT);
    expect(resupply.status).toBe("placed");
  });
});
