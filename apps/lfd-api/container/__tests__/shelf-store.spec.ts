import {
  acceptsStore,
  companyOfStorageKey,
  isFresh,
  isTrustedCaller,
  keysToErase,
  parseEraseOrder,
  parseShelfCall,
  storageKeyOf,
} from "../shelf-store";

/**
 * Les décisions de l'objet des rayons pro (`plan-cache-du-catalogue.md`, C2) —
 * `worker.ts` et `pro-shelves.ts` ne font que les relier au stockage. Ces
 * tests échouent si l'on :
 *
 * - laisse un autre appelant que le conteneur `Backend` joindre l'objet ;
 * - range un rayon calculé sur une version dépassée ;
 * - oublie les sites quand on efface une société ;
 * - sert une entrée échue ;
 * - confond l'espace perso avec une société.
 */
const URL_BASE = "http://rayons.interne";

describe("le contrôle de l'appelant", () => {
  it("n'admet que les conteneurs connus", () => {
    expect(isTrustedCaller("backend-id", ["backend-id"])).toBe(true);
    expect(isTrustedCaller("autre", ["backend-id"])).toBe(false);
  });

  it("refuse un appel sans identifiant de conteneur (un Worker qui lierait le proxy)", () => {
    expect(isTrustedCaller(undefined, ["backend-id"])).toBe(false);
    expect(isTrustedCaller("", [""])).toBe(false);
  });

  it("ne suppose pas un seul conteneur", () => {
    expect(isTrustedCaller("second", ["premier", "second"])).toBe(true);
  });
});

describe("les clés", () => {
  it("l'espace perso et une société ne se confondent pas", () => {
    expect(storageKeyOf("/shelves/personal")).toBe("personal");
    expect(storageKeyOf("/shelves/company/personal")).toBe("company:personal");
    expect(companyOfStorageKey("personal")).toBeNull();
    expect(companyOfStorageKey("company:co_a")).toBe("co_a");
  });

  it("décode l'identifiant, et refuse un chemin inconnu ou vide", () => {
    expect(storageKeyOf("/shelves/company/a%2Fb")).toBe("company:a/b");
    expect(storageKeyOf("/shelves/company/")).toBeNull();
    expect(storageKeyOf("/shelves/company/%E0")).toBeNull();
    expect(storageKeyOf("/autre")).toBeNull();
  });
});

describe("la lecture d'un appel", () => {
  it("une lecture porte l'instant de l'API", () => {
    expect(parseShelfCall("GET", new URL(`${URL_BASE}/shelves/company/co_a?now=1000`))).toEqual({
      kind: "read",
      key: "company:co_a",
      nowMs: 1000,
    });
  });

  it("une lecture sans instant n'est pas comprise : l'objet ne lit pas l'heure", () => {
    expect(parseShelfCall("GET", new URL(`${URL_BASE}/shelves/personal`))).toBeNull();
    expect(parseShelfCall("GET", new URL(`${URL_BASE}/shelves/personal?now=-1`))).toBeNull();
  });

  it("un rangement porte version, échéance et principal", () => {
    const url = new URL(
      `${URL_BASE}/shelves/company/co_site?version=3&expires=2000&principal=co_head`,
    );
    expect(parseShelfCall("PUT", url)).toEqual({
      kind: "store",
      key: "company:co_site",
      version: 3,
      expiresAtMs: 2000,
      principalId: "co_head",
    });
  });

  it("un rangement sans version n'est pas compris", () => {
    expect(parseShelfCall("PUT", new URL(`${URL_BASE}/shelves/personal?expires=2000`))).toBeNull();
  });

  it("un effacement, et rien d'autre", () => {
    expect(parseShelfCall("POST", new URL(`${URL_BASE}/erase`))).toEqual({ kind: "erase" });
    expect(parseShelfCall("DELETE", new URL(`${URL_BASE}/shelves/personal?now=1`))).toBeNull();
  });
});

describe("l'ordre d'effacement", () => {
  it("tout, ou une liste de sociétés", () => {
    expect(parseEraseOrder({ kind: "all" })).toEqual({ kind: "all" });
    expect(parseEraseOrder({ kind: "companies", companyIds: ["co_a"] })).toEqual({
      kind: "companies",
      companyIds: ["co_a"],
    });
  });

  it("refuse une forme inconnue plutôt que de n'effacer qu'une partie", () => {
    expect(parseEraseOrder(null)).toBeNull();
    expect(parseEraseOrder({ kind: "companies", companyIds: ["co_a", 4] })).toBeNull();
    expect(parseEraseOrder({ kind: "segment" })).toBeNull();
  });
});

describe("les décisions", () => {
  it("une entrée sert jusqu'à son échéance, exclue", () => {
    expect(isFresh(2000, 1999)).toBe(true);
    expect(isFresh(2000, 2000)).toBe(false);
  });

  it("refuse un rangement sur une version dépassée", () => {
    expect(acceptsStore(4, 4)).toBe(true);
    expect(acceptsStore(5, 4)).toBe(false);
    expect(acceptsStore(4, 5)).toBe(false);
  });

  it("efface une société, ses sites (par leur principal), et rien d'autre", () => {
    const entries = [
      { key: "company:co_head", principalId: null },
      { key: "company:co_site", principalId: "co_head" },
      { key: "company:co_other", principalId: null },
      { key: "personal", principalId: null },
    ];
    expect(keysToErase(entries, ["co_head"])).toEqual(["company:co_head", "company:co_site"]);
  });
});
