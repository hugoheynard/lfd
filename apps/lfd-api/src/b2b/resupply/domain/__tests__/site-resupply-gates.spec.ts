import { resupplyOriginOf } from "../resupply-origin.js";
import { SiteResupply } from "../site-resupply.js";
import {
  EmptyResupplyError,
  ResupplyAlreadyPlacedError,
  UnknownResupplyOriginError,
} from "../site-resupply-errors.js";
import {
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyDayPassedError,
  ResupplyNotCancellableError,
  BakehouseResupplyAfterStopError,
  ResupplyFrozenInPlanError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
} from "../site-resupply-gate-errors.js";
import { SiteResupplyLine } from "../site-resupply-line.js";
import {
  AUTHOR,
  DEADLINE,
  draft,
  EVENING,
  LATE_NIGHT,
  line,
  trace,
} from "./site-resupply-fixtures.js";

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
    resupply.cancel(trace(LATE_NIGHT), null, false, false);
    expect(resupply.status).toBe("cancelled");
    expect(resupply.cancelled).toEqual(trace(LATE_NIGHT));
    expect(() => resupply.cancel(trace(LATE_NIGHT), null, false, false)).toThrow(
      ResupplyNotCancellableError,
    );
  });

  it("un brouillon ne s'annule pas : il n'a jamais été passé", () => {
    expect(() => draft("asap").cancel(trace(EVENING), null, false, false)).toThrow(
      ResupplyNotCancellableError,
    );
  });

  /** Trou laissé par R2 : un réassort arrivé et réceptionné s'annulait encore. */
  it("un réassort déjà réceptionné ne s'annule plus, et le refus nomme qui et à quelle heure", () => {
    const resupply = draft("asap");
    resupply.place(trace(EVENING), null, false);
    const reception = { at: LATE_NIGHT, author: { ...AUTHOR, name: "Léa Roux" } };

    expect(() => resupply.cancel(trace(LATE_NIGHT), reception, false, false)).toThrow(
      ResupplyAlreadyReceivedNotCancellableError,
    );
    expect(() => resupply.cancel(trace(LATE_NIGHT), reception, false, false)).toThrow(
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
      name: null,
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
        name: null,
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
        name: null,
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

    expect(() => resupply.cancel(trace(LATE_NIGHT), null, true, false)).toThrow(
      /arrêté.*Réceptionnez-le avec un écart/u,
    );
    expect(() => resupply.cancel(trace(LATE_NIGHT), null, true, false)).toThrow(
      ResupplyFrozenInPlanError,
    );
    expect(resupply.status).toBe("placed");
    resupply.cancel(trace(LATE_NIGHT), null, false, false);
    expect(resupply.status).toBe("cancelled");
  });

  it("« au plus tôt » s'annule quel que soit l'état du plan", () => {
    const resupply = draft("asap", EVENING);
    resupply.place(trace(EVENING), null, false);
    resupply.cancel(trace(LATE_NIGHT), null, true, false);
    expect(resupply.status).toBe("cancelled");
  });
});
