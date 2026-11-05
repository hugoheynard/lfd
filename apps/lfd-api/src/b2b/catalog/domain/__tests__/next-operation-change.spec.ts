import { nextOperationChange } from "../next-operation-change.js";
import type { SellableOperation } from "../ports/catalog-operations.reader.js";

/**
 * Le prochain instant d'opération qui change un rayon
 * (`le-rayon-en-cache.md`, § 6.3). La fonction ne lit AUCUNE
 * horloge — `now` est un argument —, donc ces dates ne sont comparées qu'entre
 * elles : elles peuvent rester absolues.
 */

/** 1er nov. 00:00 Paris (UTC+1). */
const ANNOUNCE = new Date("2026-10-31T23:00:00.000Z");
/** 15 nov. 00:00 Paris. */
const ORDER_FROM = new Date("2026-11-14T23:00:00.000Z");
/** 21 déc. 12:00 Paris. */
const ORDER_UNTIL = new Date("2026-12-21T11:00:00.000Z");
/** Le lendemain du 24 déc., minuit à Paris. */
const END = new Date("2026-12-24T23:00:00.000Z");

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
    skus: ["PAT-9-1"],
    ...over,
  };
}

const before = (instant: Date): Date => new Date(instant.getTime() - 1);

describe("nextOperationChange", () => {
  it("sans opération, aucun instant", () => {
    expect(nextOperationChange([], "pro", ANNOUNCE)).toBeNull();
  });

  it("rend chacun des quatre instants, dans l'ordre où ils arrivent", () => {
    expect(nextOperationChange([noel()], "pro", before(ANNOUNCE))).toEqual(ANNOUNCE);
    expect(nextOperationChange([noel()], "pro", ANNOUNCE)).toEqual(ORDER_FROM);
    expect(nextOperationChange([noel()], "pro", ORDER_FROM)).toEqual(ORDER_UNTIL);
    expect(nextOperationChange([noel()], "pro", ORDER_UNTIL)).toEqual(END);
  });

  it("ignore un instant passé ou égal à maintenant : la fin passée, plus rien", () => {
    expect(nextOperationChange([noel()], "pro", END)).toBeNull();
  });

  it("sans `orderFrom`, l'ouverture est l'annonce — pas d'instant de plus", () => {
    expect(nextOperationChange([noel({ orderFrom: null })], "pro", ANNOUNCE)).toEqual(ORDER_UNTIL);
  });

  it("garde le plus proche de plusieurs opérations", () => {
    const soon = new Date(ANNOUNCE.getTime() + 60_000);
    const galette = noel({ key: "galette", announceFrom: soon, orderFrom: null });
    expect(nextOperationChange([noel(), galette], "pro", ANNOUNCE)).toEqual(soon);
  });

  it("ignore une opération qui n'atteint pas cette clientèle", () => {
    const publicOnly = noel({ audience: "public" });
    expect(nextOperationChange([publicOnly], "pro", before(ANNOUNCE))).toBeNull();
    expect(nextOperationChange([publicOnly], "public", before(ANNOUNCE))).toEqual(ANNOUNCE);
  });

  it.each<[string, string, string]>([
    // Passage à l'heure d'hiver la nuit du 25 oct. 2026 : le lendemain du 24
    // commence encore à l'heure d'été, celui du 25 déjà à l'heure d'hiver.
    ["veille du passage à l'heure d'hiver", "2026-10-24", "2026-10-24T22:00:00.000Z"],
    ["jour du passage à l'heure d'hiver", "2026-10-25", "2026-10-25T23:00:00.000Z"],
    // Passage à l'heure d'été la nuit du 28 mars 2027.
    ["veille du passage à l'heure d'été", "2027-03-27", "2027-03-27T23:00:00.000Z"],
    ["jour du passage à l'heure d'été", "2027-03-28", "2027-03-28T22:00:00.000Z"],
  ])("la fin du jour de retrait est minuit à Paris — %s", (_case, pickupUntil, end) => {
    const operation = noel({
      announceFrom: new Date("2026-01-01T00:00:00.000Z"),
      orderFrom: null,
      orderUntil: new Date("2026-01-02T00:00:00.000Z"),
      pickupFrom: "2026-01-03",
      pickupUntil,
    });
    expect(nextOperationChange([operation], "pro", new Date("2026-02-01T00:00:00.000Z"))).toEqual(
      new Date(end),
    );
  });
});
