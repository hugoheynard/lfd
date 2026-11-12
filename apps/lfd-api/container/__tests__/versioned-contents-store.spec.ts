import {
  acceptsContentBody,
  CONTENT_MAX_BYTES,
  contentKeyOf,
  parseContentCall,
  servesContent,
} from "../versioned-contents-store";

/**
 * Les contenus versionnés de l'objet des journées
 * (`plan-catalogue-du-back-office.md`, § 3.5). Ces tests échouent si l'on
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
    });
    expect(store?.kind).toBe("content-store");
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

  it("refuse une charge au-delà du plafond, ou qui n'est pas du JSON", () => {
    expect(acceptsContentBody('{"a":1}')).toBe(true);
    expect(acceptsContentBody(`"${"x".repeat(CONTENT_MAX_BYTES)}"`)).toBe(false);
    expect(acceptsContentBody("pas du json")).toBe(false);
  });
});
