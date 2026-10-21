import { resupplyTotals } from "../resupply-totals.js";
import { resupplyTargetOf, SiteResupply } from "../site-resupply.js";
import {
  EmptyResupplyError,
  IncompleteResupplyLineError,
  InvalidRequestedQuantityError,
  ResupplyAlreadyPlacedError,
  ResupplyLineDuplicatedError,
  ResupplyNotCancellableError,
  ResupplyPastCutoffError,
  UnknownResupplyTargetError,
} from "../site-resupply-errors.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/** 17 h à Paris, le 2 janvier (heure d'hiver) : seules des dates comparées entre elles. */
const EVENING = new Date("2026-01-02T16:00:00Z");
/** 23 h 30 à Paris le 2 janvier : après la limite, encore le même jour. */
const LATE_NIGHT = new Date("2026-01-02T22:30:00Z");
/** 0 h 30 à Paris le 3 janvier, mais encore le 2 en UTC : la journée suit Paris. */
const AFTER_MIDNIGHT = new Date("2026-01-02T23:30:00Z");
/** L'heure limite de demain : 18 h à Paris le 2 janvier. */
const DEADLINE = new Date("2026-01-02T17:00:00Z");

const AUTHOR = { staffUserId: "staff_1", name: "Lou", role: "counter" };

function trace(at: Date) {
  return { at, author: AUTHOR };
}

function line(sku: string, quantity: number): SiteResupplyLine {
  return SiteResupplyLine.of({ sku, label: `Article ${sku}`, quantity });
}

function draft(target: "tomorrow" | "asap", at = EVENING): SiteResupply {
  const resupply = SiteResupply.draft({ id: "rs1", siteId: "site_1", target, at });
  resupply.addLine(line("CRO", 12));
  return resupply;
}

describe("SiteResupplyLine", () => {
  it.each([0, -1, 1.5, Number.NaN])("refuse la quantité demandée %p", (quantity) => {
    expect(() => line("CRO", quantity)).toThrow(InvalidRequestedQuantityError);
  });

  it("refuse une ligne sans article ni libellé", () => {
    expect(() => SiteResupplyLine.of({ sku: " ", label: "x", quantity: 1 })).toThrow(
      IncompleteResupplyLineError,
    );
    expect(() => SiteResupplyLine.of({ sku: "CRO", label: " ", quantity: 1 })).toThrow(
      IncompleteResupplyLineError,
    );
  });
});

describe("SiteResupply — la journée suit la visée, à l'heure de Paris", () => {
  it("« pour demain » vise le lendemain, « au plus tôt » le jour même", () => {
    expect(draft("tomorrow").serviceDay).toBe("2026-01-03");
    expect(draft("asap").serviceDay).toBe("2026-01-02");
  });

  it("après minuit à Paris, « au plus tôt » vise le nouveau jour même si l'UTC est encore la veille", () => {
    expect(draft("asap", AFTER_MIDNIGHT).serviceDay).toBe("2026-01-03");
  });

  it("relit une visée stockée et refuse une valeur inconnue", () => {
    expect(resupplyTargetOf("asap")).toBe("asap");
    expect(() => resupplyTargetOf("yesterday")).toThrow(UnknownResupplyTargetError);
  });
});

describe("SiteResupply — les lignes", () => {
  it("refuse le même article deux fois", () => {
    const resupply = draft("asap");
    expect(() => resupply.addLine(line("CRO", 1))).toThrow(ResupplyLineDuplicatedError);
  });

  it("refuse de passer un réassort vide", () => {
    const resupply = SiteResupply.draft({ id: "r", siteId: "s", target: "asap", at: EVENING });
    expect(() => resupply.place(trace(EVENING), null)).toThrow(EmptyResupplyError);
  });

  it("une fois passé, ses lignes ne bougent plus et il ne se repasse pas", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), null);
    expect(() => resupply.addLine(line("PAC", 1))).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.place(trace(EVENING), null)).toThrow(ResupplyAlreadyPlacedError);
  });
});

describe("SiteResupply — l'heure limite", () => {
  it("« pour demain » passe jusqu'à la seconde de la limite incluse", () => {
    const resupply = draft("tomorrow", DEADLINE);
    resupply.place(trace(DEADLINE), DEADLINE);
    expect(resupply.status).toBe("placed");
    expect(resupply.placed).toEqual(trace(DEADLINE));
  });

  it("« pour demain » est refusé après la limite quand le réassort y est soumis", () => {
    const resupply = draft("tomorrow", LATE_NIGHT);
    expect(() => resupply.place(trace(LATE_NIGHT), DEADLINE)).toThrow(ResupplyPastCutoffError);
    expect(resupply.status).toBe("draft");
  });

  it("« pour demain » passe tard quand aucune limite ne s'oppose (sans limite, ou aucune règle)", () => {
    const resupply = draft("tomorrow", LATE_NIGHT);
    resupply.place(trace(LATE_NIGHT), null);
    expect(resupply.status).toBe("placed");
  });

  it("« au plus tôt » n'a jamais d'heure limite", () => {
    const resupply = draft("asap", LATE_NIGHT);
    resupply.place(trace(LATE_NIGHT), DEADLINE);
    expect(resupply.status).toBe("placed");
  });

  it("le refus nomme la limite à l'heure de Paris et le geste de sortie", () => {
    const resupply = draft("tomorrow", LATE_NIGHT);
    expect(() => resupply.place(trace(LATE_NIGHT), DEADLINE)).toThrow(
      /2026-01-02 à 18:00.*au plus tôt/u,
    );
  });
});

describe("SiteResupply — l'annulation", () => {
  it("annule un réassort passé, une seule fois", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), null);
    resupply.cancel(trace(LATE_NIGHT));
    expect(resupply.status).toBe("cancelled");
    expect(resupply.cancelled).toEqual(trace(LATE_NIGHT));
    expect(() => resupply.cancel(trace(LATE_NIGHT))).toThrow(ResupplyNotCancellableError);
  });

  it("un brouillon ne s'annule pas : il n'a jamais été passé", () => {
    expect(() => draft("asap").cancel(trace(EVENING))).toThrow(ResupplyNotCancellableError);
  });
});

describe("resupplyTotals", () => {
  it("cumule par article dans l'ordre de première demande, libellé de la première ligne", () => {
    expect(
      resupplyTotals([
        [
          { sku: "CRO", label: "Croissant", quantity: 12 },
          { sku: "PAC", label: "Pain au chocolat", quantity: 6 },
        ],
        [{ sku: "CRO", label: "Croissant beurre", quantity: 8 }],
      ]),
    ).toEqual([
      { sku: "CRO", label: "Croissant", quantity: 20 },
      { sku: "PAC", label: "Pain au chocolat", quantity: 6 },
    ]);
  });

  it("rien demandé, rien à produire", () => {
    expect(resupplyTotals([])).toEqual([]);
  });
});
