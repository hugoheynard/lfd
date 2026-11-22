import { companiesToLock, firstClosed } from "../order-companies.share-lock.js";

describe("le verrou de la passation — les lignes prises", () => {
  it("société, principal et payeur : dédoublonnés, triés, sans les absents", () => {
    expect(companiesToLock(["co_site", null, "co_payer"])).toEqual(["co_payer", "co_site"]);
    expect(companiesToLock(["co_b", "co_a", "co_b"])).toEqual(["co_a", "co_b"]);
    expect(companiesToLock([null, null, null])).toEqual([]);
  });
});

describe("le verrou de la passation — le refus", () => {
  const open = { id: "co_site", status: "active", archived_at: null } as const;

  it("toutes ouvertes : rien à refuser", () => {
    expect(firstClosed([open, { ...open, id: "co_principal" }])).toBeNull();
  });

  it("🔴 un payeur supprimé est refusé, même quand le site est ouvert", () => {
    expect(firstClosed([open, { ...open, id: "co_payer", archived_at: new Date(0) }])).toBe(
      "co_payer",
    );
  });

  it("🔴 un payeur résilié est refusé", () => {
    expect(firstClosed([open, { ...open, id: "co_payer", status: "terminated" }])).toBe("co_payer");
  });
});
