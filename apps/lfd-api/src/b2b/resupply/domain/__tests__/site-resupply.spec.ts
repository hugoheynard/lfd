import { resupplyTotals } from "../resupply-totals.js";
import { resupplyOriginOf } from "../resupply-origin.js";
import { resupplyTargetOf, SiteResupply } from "../site-resupply.js";
import {
  EmptyResupplyError,
  IncompleteResupplyLineError,
  InvalidRequestedQuantityError,
  ResupplyAlreadyPlacedError,
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyDayPassedError,
  ResupplyLineNotInDraftError,
  ResupplyNotCancellableError,
  BakehouseResupplyAfterStopError,
  ResupplyFrozenInPlanError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
  SiteResupplyChangedMeanwhileError,
  UnknownResupplyOriginError,
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
    expect(() => resupply.place(trace(EVENING), null, false)).toThrow(EmptyResupplyError);
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
      lines: [],
      placed: null,
      cancelled: null,
    });
    expect(() => resupply.assertSeen(2)).toThrow(SiteResupplyChangedMeanwhileError);
    expect(() => resupply.assertSeen(3)).not.toThrow();
  });

  it("refuse de passer un réassort vide", () => {
    const resupply = SiteResupply.draft({ id: "r", siteId: "s", target: "asap", at: EVENING });
    expect(() => resupply.place(trace(EVENING), null, false)).toThrow(EmptyResupplyError);
  });

  it("une fois passé, ses lignes ne bougent plus et il ne se repasse pas", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), null, false);
    expect(() => resupply.addLine(line("PAC", 1))).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.correctLine("CRO", 1)).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.withdrawLine("CRO")).toThrow(ResupplyAlreadyPlacedError);
    expect(() => resupply.place(trace(EVENING), null, false)).toThrow(ResupplyAlreadyPlacedError);
  });
});

describe("SiteResupply — l'heure limite", () => {
  it("« pour demain » passe jusqu'à la seconde de la limite incluse", () => {
    const resupply = draft("tomorrow", DEADLINE);
    resupply.place(trace(DEADLINE), DEADLINE, false);
    expect(resupply.status).toBe("placed");
    expect(resupply.placed).toEqual(trace(DEADLINE));
  });

  it("« pour demain » est refusé après l'heure du réassort", () => {
    const resupply = draft("tomorrow", LATE_NIGHT);
    expect(() => resupply.place(trace(LATE_NIGHT), DEADLINE, false)).toThrow(
      ResupplyPastCutoffError,
    );
    expect(resupply.status).toBe("draft");
  });

  it("« pour demain » passe tard quand l'heure du réassort n'existe pas ce jour-là", () => {
    const resupply = draft("tomorrow", LATE_NIGHT);
    resupply.place(trace(LATE_NIGHT), null, false);
    expect(resupply.status).toBe("placed");
  });

  it("« au plus tôt » n'a jamais d'heure limite", () => {
    const resupply = draft("asap", LATE_NIGHT);
    resupply.place(trace(LATE_NIGHT), DEADLINE, false);
    expect(resupply.status).toBe("placed");
  });

  it("le refus nomme la limite à l'heure de Paris et le geste de sortie", () => {
    const resupply = draft("tomorrow", LATE_NIGHT);
    expect(() => resupply.place(trace(LATE_NIGHT), DEADLINE, false)).toThrow(
      /la veille à 18:00.*Demandez au fournil/u,
    );
  });
});

describe("SiteResupply — une journée passée", () => {
  /** 9 h à Paris le 4 janvier : la journée du 3 est passée. */
  const TWO_DAYS_LATER = new Date("2026-01-04T08:00:00Z");
  /** 9 h à Paris le 3 janvier : la journée visée, le matin même. */
  const NEXT_MORNING = new Date("2026-01-03T08:00:00Z");

  it("une demande « pour demain » restée en cours ne s'envoie plus le surlendemain", () => {
    const resupply = draft("tomorrow");
    expect(() => resupply.place(trace(TWO_DAYS_LATER), null, false)).toThrow(
      ResupplyDayPassedError,
    );
    expect(resupply.status).toBe("draft");
  });

  it("le matin de sa journée, « pour demain » part encore si aucune limite ne s'y oppose", () => {
    const resupply = draft("tomorrow");
    resupply.place(trace(NEXT_MORNING), null, false);
    expect(resupply.status).toBe("placed");
  });

  it("une demande « au plus tôt » de la veille ne s'envoie plus", () => {
    expect(() => draft("asap").place(trace(NEXT_MORNING), null, false)).toThrow(
      ResupplyDayPassedError,
    );
  });
});

describe("SiteResupply — l'annulation", () => {
  it("annule un réassort passé, une seule fois", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), null, false);
    resupply.cancel(trace(LATE_NIGHT), null, false);
    expect(resupply.status).toBe("cancelled");
    expect(resupply.cancelled).toEqual(trace(LATE_NIGHT));
    expect(() => resupply.cancel(trace(LATE_NIGHT), null, false)).toThrow(
      ResupplyNotCancellableError,
    );
  });

  it("un brouillon ne s'annule pas : il n'a jamais été passé", () => {
    expect(() => draft("asap").cancel(trace(EVENING), null, false)).toThrow(
      ResupplyNotCancellableError,
    );
  });

  /** Trou laissé par R2 : un réassort arrivé et réceptionné s'annulait encore. */
  it("un réassort déjà réceptionné ne s'annule plus, et le refus nomme qui et à quelle heure", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), null, false);
    const reception = { at: LATE_NIGHT, author: { ...AUTHOR, name: "Léa Roux" } };

    expect(() => resupply.cancel(trace(LATE_NIGHT), reception, false)).toThrow(
      ResupplyAlreadyReceivedNotCancellableError,
    );
    expect(() => resupply.cancel(trace(LATE_NIGHT), reception, false)).toThrow(
      /déjà réceptionné par Léa Roux à 23:30/u,
    );
    expect(resupply.status).toBe("placed");
  });
});

describe("SiteResupply — l'origine (R1d)", () => {
  it("la demande du comptoir est un brouillon d'origine `counter`", () => {
    expect(draft("asap").origin).toBe("counter");
  });

  it("le fournil crée ET envoie son réassort d'un geste, sans brouillon", () => {
    const sent = SiteResupply.sentByBakehouse({
      id: "rs2",
      siteId: "site_1",
      target: "asap",
      lines: [line("CRO", 5), line("PAC", 2), line("CRO", 3)],
      trace: trace(EVENING),
      deadline: null,
      planStopped: false,
    });

    expect(sent).toMatchObject({ origin: "bakehouse", status: "placed", serviceDay: "2026-01-02" });
    expect(sent.placed).toEqual(trace(EVENING));
    expect(sent.lines.map((entry) => [entry.sku, entry.quantity])).toEqual([
      ["CRO", 8],
      ["PAC", 2],
    ]);
    expect(() => sent.addLine(line("CRO", 1))).toThrow(ResupplyAlreadyPlacedError);
  });

  it("le fournil suit les règles d'envoi du comptoir : pas vide, l'heure limite pour demain", () => {
    const send = (lines: readonly SiteResupplyLine[], deadline: Date | null) =>
      SiteResupply.sentByBakehouse({
        id: "rs3",
        siteId: "site_1",
        target: "tomorrow",
        lines,
        trace: trace(LATE_NIGHT),
        deadline,
        planStopped: false,
      });

    expect(() => send([], null)).toThrow(EmptyResupplyError);
    // Lot R3a : le refus parle au fournil, et nomme son recours.
    expect(() => send([line("CRO", 1)], DEADLINE)).toThrow(BakehouseResupplyAfterStopError);
    expect(() => send([line("CRO", 1)], DEADLINE)).toThrow(/hors plan/u);
    expect(send([line("CRO", 1)], null).serviceDay).toBe("2026-01-03");
  });

  it("relit une origine stockée et refuse une valeur inconnue", () => {
    expect(resupplyOriginOf("bakehouse")).toBe("bakehouse");
    expect(() => resupplyOriginOf("livreur")).toThrow(UnknownResupplyOriginError);
  });
});

describe("SiteResupply — le plan du fournil arrêté (lot R3a)", () => {
  it("« pour demain » est refusé sur un plan arrêté, même avant l'heure du réassort", () => {
    const resupply = draft("tomorrow", EVENING);
    expect(() => resupply.place(trace(EVENING), DEADLINE, true)).toThrow(ResupplyPlanStoppedError);
    expect(resupply.status).toBe("draft");
  });

  it("« au plus tôt » n'entre pas au plan : un arrêt ne l'empêche pas", () => {
    const resupply = draft("asap", EVENING);
    resupply.place(trace(EVENING), DEADLINE, true);
    expect(resupply.status).toBe("placed");
  });

  it("le fournil est refusé lui aussi, avec son recours", () => {
    const send = () =>
      SiteResupply.sentByBakehouse({
        id: "rs4",
        siteId: "site_1",
        target: "tomorrow",
        lines: [line("CRO", 1)],
        trace: trace(EVENING),
        deadline: DEADLINE,
        planStopped: true,
      });
    expect(send).toThrow(BakehouseResupplyAfterStopError);
  });

  it("figé dans un plan arrêté, « pour demain » ne s'annule plus ; rouvert, si", () => {
    const resupply = draft("tomorrow", EVENING);
    resupply.place(trace(EVENING), DEADLINE, false);

    expect(() => resupply.cancel(trace(LATE_NIGHT), null, true)).toThrow(
      /arrêté.*Réceptionnez-le avec un écart/u,
    );
    expect(() => resupply.cancel(trace(LATE_NIGHT), null, true)).toThrow(ResupplyFrozenInPlanError);
    expect(resupply.status).toBe("placed");
    resupply.cancel(trace(LATE_NIGHT), null, false);
    expect(resupply.status).toBe("cancelled");
  });

  it("« au plus tôt » s'annule quel que soit l'état du plan", () => {
    const resupply = draft("asap", EVENING);
    resupply.place(trace(EVENING), null, false);
    resupply.cancel(trace(LATE_NIGHT), null, true);
    expect(resupply.status).toBe("cancelled");
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
