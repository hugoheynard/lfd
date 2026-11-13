import {
  acceptsContentBody,
  CONTENT_MAX_BYTES,
  contentKeyOf,
  parseContentCall,
  rawBytesOf,
  servesContent,
} from "../versioned-contents-store";

/**
 * Les contenus versionnés de l'objet des journées
 * (`le-cache-du-back-office.md`, § 4.5). Ces tests échouent si l'on
 * sert une charge d'un autre numéro, mélange deux révisions, ou range au-delà
 * du plafond.
 */
const URL_BASE = "http://journees.interne";

describe("objet des journées — les contenus versionnés", () => {
  it("comprend une lecture et un rangement, révision dans la clé", () => {
    const read = parseContentCall(
      "GET",
      new URL(`${URL_BASE}/contents/catalog-admin?revision=abc&version=42`),
    );
    const store = parseContentCall(
      "PUT",
      new URL(`${URL_BASE}/contents/catalog-admin?revision=abc&version=42`),
    );

    expect(read).toEqual({
      kind: "content-read",
      key: contentKeyOf("abc", "catalog-admin"),
      version: 42,
      revisionPrefix: "r:abc/",
    });
    expect(store?.kind).toBe("content-store");
  });

  it("admet une clé à préfixe `famille:sujet`, encodée comme l'API l'envoie", () => {
    const key = "pim-product:0b6f1c9e-8a3d-4f7e-9a51-2c4d6e8f0a1b";
    const read = parseContentCall(
      "GET",
      new URL(`${URL_BASE}/contents/${encodeURIComponent(key)}?revision=abc&version=7`),
    );

    expect(read).toEqual({
      kind: "content-read",
      key: contentKeyOf("abc", key),
      version: 7,
      revisionPrefix: "r:abc/",
    });
  });

  it("deux révisions ne partagent pas une clé", () => {
    expect(contentKeyOf("a", "catalog-admin")).not.toBe(contentKeyOf("b", "catalog-admin"));
  });

  it("refuse un appel mal formé", () => {
    const bad = [
      `${URL_BASE}/contents/catalog-admin?version=1`,
      `${URL_BASE}/contents/catalog-admin?revision=a`,
      `${URL_BASE}/contents/catalog-admin?revision=a&version=-1`,
      `${URL_BASE}/contents/Pas%20Une%20Cle?revision=a&version=1`,
    ];
    for (const url of bad) {
      expect(parseContentCall("GET", new URL(url))).toBeNull();
    }
    expect(
      parseContentCall("DELETE", new URL(`${URL_BASE}/contents/k?revision=a&version=1`)),
    ).toBeNull();
  });

  it("ne sert que le numéro EXACT rangé", () => {
    expect(servesContent(42, 42)).toBe(true);
    expect(servesContent(42, 43)).toBe(false);
    expect(servesContent(43, 42)).toBe(false);
    expect(servesContent(null, 42)).toBe(false);
  });

  it("range des octets opaques jusqu'au plafond, pas au-delà ni vides", () => {
    expect(acceptsContentBody(new Uint8Array([0x1f, 0x8b, 1]))).toBe(true);
    expect(acceptsContentBody(new Uint8Array(CONTENT_MAX_BYTES))).toBe(true);
    expect(acceptsContentBody(new Uint8Array(CONTENT_MAX_BYTES + 1))).toBe(false);
    expect(acceptsContentBody(new Uint8Array(0))).toBe(false);
  });

  it("lit la taille en clair annoncée par l'API, et ignore une valeur mal formée", () => {
    expect(rawBytesOf("1042000")).toBe(1_042_000);
    expect(rawBytesOf(null)).toBeNull();
    expect(rawBytesOf("-3")).toBeNull();
    expect(rawBytesOf("12ko")).toBeNull();
  });
});
