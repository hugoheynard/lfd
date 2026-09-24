import { endOfDay, operationAccess, operationStateAt } from "../operation-access.js";
import type { SellableOperation } from "../ports/catalog-operations.reader.js";

/**
 * D4 : « vendable maintenant ? ». La fonction ne lit AUCUNE horloge — `now`
 * est un argument —, donc ces dates ne sont comparées qu'entre elles : elles
 * peuvent rester absolues sans devenir une bombe à retardement.
 */

/** 1er nov. 00:00 Paris (UTC+1). */
const ANNOUNCE = new Date("2026-10-31T23:00:00.000Z");
/** 15 nov. 00:00 Paris. */
const ORDER_FROM = new Date("2026-11-14T23:00:00.000Z");
/** 21 déc. 12:00 Paris. */
const ORDER_UNTIL = new Date("2026-12-21T11:00:00.000Z");
/** Le lendemain du 24 déc., minuit à Paris : tout s'éteint. */
const END = new Date("2026-12-24T23:00:00.000Z");

const BUCHE = { sku: "PAT-9-1", operationOnly: true } as const;
const CROISSANT = { sku: "VIE-001-1", operationOnly: false } as const;

function noel(over: Partial<SellableOperation> = {}): SellableOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: null,
    image: null,
    announceFrom: ANNOUNCE,
    orderFrom: ORDER_FROM,
    orderUntil: ORDER_UNTIL,
    pickupFrom: "2026-12-20",
    pickupUntil: "2026-12-24",
    audience: "both",
    skus: ["PAT-9-1", "VIE-001-1"],
    ...over,
  };
}

const at = (instant: Date, deltaMs = 0): Date => new Date(instant.getTime() + deltaMs);
const OPEN_NOW = new Date("2026-12-01T10:00:00.000Z");

describe("operationAccess — l'article courant", () => {
  it("est libre, quelles que soient les opérations et l'heure (D3 : le croissant du 26)", () => {
    expect(operationAccess(CROISSANT, [noel()], "public", END, "2026-12-26")).toBe("free");
    expect(operationAccess(CROISSANT, [], "pro", OPEN_NOW, null)).toBe("free");
  });
});

describe("operationAccess — l'article operationOnly sans opération", () => {
  it("est absent quand aucune opération ne le porte", () => {
    expect(operationAccess(BUCHE, [], "pro", OPEN_NOW)).toBe("absent");
    expect(operationAccess(BUCHE, [noel({ skus: ["VIE-001-1"] })], "pro", OPEN_NOW)).toBe("absent");
  });

  it("est absent avant l'annonce, et visible à l'instant exact de l'annonce", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", at(ANNOUNCE, -1))).toBe("absent");
    expect(operationAccess(BUCHE, [noel()], "pro", ANNOUNCE)).toMatchObject({
      status: "closed",
      reason: "not_yet_open",
    });
  });

  it("disparaît à minuit, heure de Paris, le lendemain du dernier jour de retrait", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", at(END, -1))).toMatchObject({
      reason: "closed",
    });
    expect(operationAccess(BUCHE, [noel()], "pro", END)).toBe("absent");
  });
});

describe("operationAccess — la commande", () => {
  it("ouvre à orderFrom exactement", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", at(ORDER_FROM, -1))).toMatchObject({
      reason: "not_yet_open",
    });
    expect(operationAccess(BUCHE, [noel()], "pro", ORDER_FROM)).toBe("shown");
  });

  it("ouvre dès l'annonce quand orderFrom est absent", () => {
    expect(operationAccess(BUCHE, [noel({ orderFrom: null })], "pro", ANNOUNCE)).toBe("shown");
  });

  it("ferme à orderUntil exactement (borne exclue)", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", at(ORDER_UNTIL, -1))).toBe("shown");
    expect(operationAccess(BUCHE, [noel()], "pro", ORDER_UNTIL)).toMatchObject({
      status: "closed",
      reason: "closed",
    });
  });
});

describe("operationAccess — le jour de retrait", () => {
  it("est commandable sur les deux bornes des jours de retrait", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", OPEN_NOW, "2026-12-20")).toBe("orderable");
    expect(operationAccess(BUCHE, [noel()], "pro", OPEN_NOW, "2026-12-24")).toBe("orderable");
  });

  it("refuse la veille et le lendemain, en nommant l'opération", () => {
    for (const day of ["2026-12-19", "2026-12-25"]) {
      expect(operationAccess(BUCHE, [noel()], "pro", OPEN_NOW, day)).toEqual({
        status: "closed",
        reason: "day_outside",
        operation: noel(),
      });
    }
  });

  it("refuse une commande SANS jour (null), là où la vitrine (undefined) voit l'article", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", OPEN_NOW, null)).toMatchObject({
      reason: "no_day",
    });
    expect(operationAccess(BUCHE, [noel()], "pro", OPEN_NOW)).toBe("shown");
  });

  it("ne juge pas le jour d'une commande close : la clôture l'emporte", () => {
    expect(operationAccess(BUCHE, [noel()], "pro", ORDER_UNTIL, "2026-12-22")).toMatchObject({
      reason: "closed",
    });
  });
});

describe("operationAccess — la clientèle (D7)", () => {
  it("une opération pro ne montre rien au public, et l'inverse", () => {
    expect(operationAccess(BUCHE, [noel({ audience: "pro" })], "public", OPEN_NOW)).toBe("absent");
    expect(operationAccess(BUCHE, [noel({ audience: "pro" })], "pro", OPEN_NOW)).toBe("shown");
    expect(operationAccess(BUCHE, [noel({ audience: "public" })], "pro", OPEN_NOW)).toBe("absent");
    expect(operationAccess(BUCHE, [noel({ audience: "public" })], "public", OPEN_NOW)).toBe(
      "shown",
    );
  });

  it("both atteint les deux", () => {
    expect(operationAccess(BUCHE, [noel()], "public", OPEN_NOW)).toBe("shown");
    expect(operationAccess(BUCHE, [noel()], "pro", OPEN_NOW)).toBe("shown");
  });
});

describe("operationAccess — deux opérations (la galette, deux week-ends)", () => {
  const first = noel({
    key: "galette-1",
    announceFrom: new Date("2027-01-01T00:00:00.000Z"),
    orderFrom: null,
    orderUntil: new Date("2027-01-08T12:00:00.000Z"),
    pickupFrom: "2027-01-09",
    pickupUntil: "2027-01-10",
  });
  const second = noel({
    key: "galette-2",
    announceFrom: new Date("2027-01-01T00:00:00.000Z"),
    orderFrom: new Date("2027-01-11T00:00:00.000Z"),
    orderUntil: new Date("2027-01-15T12:00:00.000Z"),
    pickupFrom: "2027-01-16",
    pickupUntil: "2027-01-17",
  });
  const both = [second, first];

  it("est commandable dès que L'UNE l'autorise", () => {
    const now = new Date("2027-01-12T10:00:00.000Z");
    expect(operationAccess(BUCHE, both, "pro", now, "2027-01-16")).toBe("orderable");
  });

  it("entre les deux, rend l'ouverture à venir plutôt que la clôture passée", () => {
    const now = new Date("2027-01-09T10:00:00.000Z");
    expect(operationAccess(BUCHE, both, "pro", now)).toEqual({
      status: "closed",
      reason: "not_yet_open",
      operation: second,
    });
  });

  it("un jour de la première refusé par la seconde, ouverte, nomme la seconde", () => {
    const now = new Date("2027-01-12T10:00:00.000Z");
    expect(operationAccess(BUCHE, both, "pro", now, "2027-01-10")).toMatchObject({
      reason: "day_outside",
      operation: { key: "galette-2" },
    });
  });

  it("avant toute ouverture, nomme celle qui ouvre le plus tôt", () => {
    const early = noel({ key: "tot", orderFrom: new Date("2026-11-10T00:00:00.000Z") });
    const late = noel({ key: "tard", orderFrom: new Date("2026-11-20T00:00:00.000Z") });
    const now = new Date("2026-11-05T00:00:00.000Z");
    expect(operationAccess(BUCHE, [late, early], "pro", now)).toMatchObject({
      operation: { key: "tot" },
    });
  });
});

describe("la fin d'un jour, au changement d'heure d'octobre", () => {
  it("le samedi 24 octobre 2026 finit à 22:00 UTC (encore en heure d'été)", () => {
    expect(endOfDay("2026-10-24").toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("le dimanche 25 octobre 2026, jour de 25 heures, finit à 23:00 UTC", () => {
    expect(endOfDay("2026-10-25").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("une opération qui se retire le 25 octobre reste visible jusqu'à minuit de Paris", () => {
    const toussaint = noel({
      announceFrom: new Date("2026-10-01T00:00:00.000Z"),
      orderFrom: null,
      orderUntil: new Date("2026-10-24T10:00:00.000Z"),
      pickupFrom: "2026-10-25",
      pickupUntil: "2026-10-25",
    });
    expect(
      operationAccess(BUCHE, [toussaint], "pro", new Date("2026-10-25T22:59:59.999Z")),
    ).toMatchObject({ reason: "closed" });
    expect(operationAccess(BUCHE, [toussaint], "pro", new Date("2026-10-25T23:00:00.000Z"))).toBe(
      "absent",
    );
  });
});

describe("operationStateAt", () => {
  it("annoncée, ouverte, close, puis éteinte", () => {
    expect(operationStateAt(noel(), at(ANNOUNCE, -1))).toBeNull();
    expect(operationStateAt(noel(), ANNOUNCE)).toBe("announced");
    expect(operationStateAt(noel(), ORDER_FROM)).toBe("open");
    expect(operationStateAt(noel(), ORDER_UNTIL)).toBe("closed");
    expect(operationStateAt(noel(), END)).toBeNull();
  });
});
