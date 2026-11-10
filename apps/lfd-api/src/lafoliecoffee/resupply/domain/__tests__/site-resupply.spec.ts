import { resupplyTotals } from "../resupply-totals.js";
import { resupplyTargetOf, SiteResupply } from "../site-resupply.js";
import {
  EmptyResupplyError,
  IncompleteResupplyLineError,
  InvalidRequestedQuantityError,
  ResupplyAlreadyPlacedError,
  ResupplyLineNotInDraftError,
  SiteResupplyChangedMeanwhileError,
  UnknownResupplyTargetError,
} from "../site-resupply-errors.js";
import { ResupplyNotReceivableError } from "../site-resupply-gate-errors.js";
import { SiteResupplyLine } from "../site-resupply-line.js";
import { AFTER_MIDNIGHT, draft, EVENING, line, trace } from "./site-resupply-fixtures.js";
import { UNGATED_PLACEMENT } from "../site-resupply-checks.js";

describe("SiteResupplyLine", () => {
  it.each([0, -1, 1.5, Number.NaN])("refuse la quantité demandée %p", (quantity) => {
    expect(() => line("CRO", quantity)).toThrow(InvalidRequestedQuantityError);
  });

  it("refuse une ligne sans article ni libellé", () => {
    expect(() =>
      SiteResupplyLine.of({ sku: " ", label: "x", quantity: 1, saleUnit: "piece" as const }),
    ).toThrow(IncompleteResupplyLineError);
    expect(() =>
      SiteResupplyLine.of({ sku: "CRO", label: " ", quantity: 1, saleUnit: "piece" as const }),
    ).toThrow(IncompleteResupplyLineError);
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
  it("un article ajouté de nouveau voit sa quantité s'ADDITIONNER, à sa place", () => {
    const resupply = draft("asap");
    resupply.addLine(line("PAC", 2));
    resupply.addLine(line("CRO", 3));
    expect(resupply.lines.map((l) => [l.sku, l.quantity])).toEqual([
      ["CRO", 15],
      ["PAC", 2],
    ]);
  });

  it("corrige la quantité d'un article, à un entier positif seulement", () => {
    const resupply = draft("asap");
    resupply.correctLine("CRO", 4);
    expect(resupply.lines[0]?.quantity).toBe(4);
    expect(() => resupply.correctLine("CRO", 0)).toThrow(InvalidRequestedQuantityError);
    expect(resupply.lines[0]?.quantity).toBe(4);
  });

  it("retire un article ; la demande peut rester vide, mais ne s'envoie pas", () => {
    const resupply = draft("asap");
    resupply.withdrawLine("CRO");
    expect(resupply.lines).toEqual([]);
    expect(() => resupply.place(trace(EVENING), UNGATED_PLACEMENT)).toThrow(EmptyResupplyError);
  });

  it("corriger ou retirer un article absent est refusé", () => {
    const resupply = draft("asap");
    expect(() => resupply.correctLine("PAC", 1)).toThrow(ResupplyLineNotInDraftError);
    expect(() => resupply.withdrawLine("PAC")).toThrow(ResupplyLineNotInDraftError);
  });

  it("refuse un geste posé sur une autre version que la sienne", () => {
    const resupply = SiteResupply.restore({
      id: "r",
      siteId: "s",
      target: "asap",
      serviceDay: "2026-01-02",
      version: 3,
      origin: "counter",
      name: null,
      lines: [],
      placed: null,
      cancelled: null,
      arrived: null,
    });
    expect(() => resupply.assertSeen(2)).toThrow(SiteResupplyChangedMeanwhileError);
    expect(() => resupply.assertSeen(3)).not.toThrow();
  });

  it("refuse de passer un réassort vide", () => {
    const resupply = SiteResupply.draft({ id: "r", siteId: "s", target: "asap", at: EVENING });
    expect(() => resupply.place(trace(EVENING), UNGATED_PLACEMENT)).toThrow(EmptyResupplyError);
  });

  it("une fois passé, ses lignes ne bougent plus et il ne se repasse pas", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), UNGATED_PLACEMENT);
    expect(() => resupply.addLine(line("PAC", 1))).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.correctLine("CRO", 1)).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.withdrawLine("CRO")).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.place(trace(EVENING), UNGATED_PLACEMENT)).toThrow(
      ResupplyAlreadyPlacedError,
    );
  });
});

describe("resupplyTotals", () => {
  it("cumule par article dans l'ordre de première demande, libellé de la première ligne", () => {
    expect(
      resupplyTotals([
        [
          { sku: "CRO", label: "Croissant", quantity: 12, saleUnit: "piece" as const },
          { sku: "PAC", label: "Pain au chocolat", quantity: 6, saleUnit: "piece" as const },
        ],
        [{ sku: "CRO", label: "Croissant beurre", quantity: 8, saleUnit: "piece" as const }],
      ]),
    ).toEqual([
      { sku: "CRO", label: "Croissant", quantity: 20, saleUnit: "piece" as const },
      { sku: "PAC", label: "Pain au chocolat", quantity: 6, saleUnit: "piece" as const },
    ]);
  });

  it("rien demandé, rien à produire", () => {
    expect(resupplyTotals([])).toEqual([]);
  });
});

describe("SiteResupply — ce que l'adaptateur réécrit, et la réception (audit du 2026-11-02)", () => {
  /** Régression M4 : toutes les lignes étaient réécrites à chaque geste, envoi et annulation compris. */
  it("ne dit ses lignes changées qu'après un geste sur elles", () => {
    const resupply = draft("asap");
    const restored = SiteResupply.restore({
      id: resupply.id,
      siteId: resupply.siteId,
      target: resupply.target,
      serviceDay: resupply.serviceDay,
      version: 1,
      origin: resupply.origin,
      name: null,
      lines: resupply.lines,
      placed: null,
      cancelled: null,
      arrived: null,
    });

    expect(restored.linesChanged).toBe(false);
    restored.place(trace(EVENING), UNGATED_PLACEMENT);
    expect(restored.linesChanged).toBe(false);
  });

  it("dit ses lignes changées après un ajout", () => {
    const resupply = draft("asap");
    expect(resupply.linesChanged).toBe(true);
  });

  /** Régression G1 : la réception ne passait pas par l'agrégat. */
  it("se laisse réceptionner envoyé, jamais en brouillon ni annulé", () => {
    const resupply = draft("asap");
    expect(() => resupply.assertReceivable()).toThrow(ResupplyNotReceivableError);
    resupply.place(trace(EVENING), UNGATED_PLACEMENT);
    expect(() => resupply.assertReceivable()).not.toThrow();
    resupply.cancel(trace(EVENING), { reception: null, planStopped: false, launched: false });
    expect(() => resupply.assertReceivable()).toThrow(ResupplyNotReceivableError);
  });
});
