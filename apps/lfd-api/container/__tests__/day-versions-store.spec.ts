import {
  acceptsCard,
  cardKeyOf,
  oldestKeptDay,
  parseDayCard,
  parseDayVersionsCall,
} from "../day-versions-store";

/**
 * Les décisions de l'objet des journées (`plan-objet-des-journees.md`) —
 * `day-versions.ts` ne fait que les relier au stockage. Ces tests échouent si
 * l'on :
 *
 * - remplace une carte par une carte lue plus tôt ;
 * - mélange deux révisions du code sous la même clé ;
 * - garde des journées de plus de trois jours ;
 * - accepte un appel ou une carte mal formés.
 */
const URL_BASE = "http://journees.interne";

// Instants comparés entre eux seulement : aucune horloge n'est lue.
const READ_AT = Date.UTC(2030, 2, 12, 9, 0, 0);

describe("objet des journées — le rangement conditionnel par instant de lecture", () => {
  it("range une carte quand aucune n'est gardée", () => {
    expect(acceptsCard(null, READ_AT)).toBe(true);
  });

  it("remplace la carte gardée par une carte lue PLUS TARD", () => {
    expect(acceptsCard(READ_AT, READ_AT + 1)).toBe(true);
  });

  it("refuse une carte lue plus tôt, ou au même instant, que la gardée", () => {
    expect(acceptsCard(READ_AT, READ_AT - 1)).toBe(false);
    expect(acceptsCard(READ_AT, READ_AT)).toBe(false);
  });
});

describe("objet des journées — l'oubli des vieilles journées", () => {
  it("garde les trois derniers jours et oublie ce qui est avant", () => {
    const oldest = oldestKeptDay(READ_AT);

    expect(oldest).toBe("2030-03-09");
    expect("2030-03-08" < oldest).toBe(true);
    expect("2030-03-09" < oldest).toBe(false);
    expect("2030-03-12" < oldest).toBe(false);
  });
});

describe("objet des journées — la clé et les appels", () => {
  it("met la révision du code dans la clé : deux images ne partagent rien", () => {
    expect(cardKeyOf("abc", "2030-03-12")).not.toBe(cardKeyOf("abd", "2030-03-12"));
    expect(cardKeyOf("a/b", "2030-03-12")).toBe("r:a%2Fb/2030-03-12");
  });

  it("comprend une lecture et un rangement d'une journée", () => {
    const url = new URL(`${URL_BASE}/days/2030-03-12?revision=abc`);

    expect(parseDayVersionsCall("GET", url)).toEqual({ kind: "read", key: "r:abc/2030-03-12" });
    expect(parseDayVersionsCall("PUT", url)).toEqual({
      kind: "store",
      key: "r:abc/2030-03-12",
      serviceDay: "2030-03-12",
    });
  });

  it("refuse un appel sans révision, sur une journée mal formée ou d'une autre méthode", () => {
    expect(parseDayVersionsCall("GET", new URL(`${URL_BASE}/days/2030-03-12`))).toBeNull();
    expect(parseDayVersionsCall("GET", new URL(`${URL_BASE}/days/demain?revision=a`))).toBeNull();
    expect(parseDayVersionsCall("GET", new URL(`${URL_BASE}/shelves?revision=a`))).toBeNull();
    expect(
      parseDayVersionsCall("DELETE", new URL(`${URL_BASE}/days/2030-03-12?revision=a`)),
    ).toBeNull();
  });

  it("lit une carte bien formée, refuse le reste", () => {
    expect(parseDayCard({ versions: { orders: 3, production: 0 }, readAtMs: READ_AT })).toEqual({
      versions: { orders: 3, production: 0 },
      readAtMs: READ_AT,
    });
    expect(parseDayCard({ versions: { orders: -1 }, readAtMs: READ_AT })).toBeNull();
    expect(parseDayCard({ versions: { orders: "3" }, readAtMs: READ_AT })).toBeNull();
    expect(parseDayCard({ versions: {}, readAtMs: 1.5 })).toBeNull();
    expect(parseDayCard(null)).toBeNull();
  });
});
