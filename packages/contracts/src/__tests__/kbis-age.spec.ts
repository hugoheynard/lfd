import { kbisAgeOf } from "../kbis-age.js";

describe("kbisAgeOf", () => {
  it("dit `undated` d'une certification sans date", () => {
    expect(kbisAgeOf(null, "2026-11-11")).toBe("undated");
  });

  it("dit `fresh` jusqu'à la veille des 3 mois", () => {
    expect(kbisAgeOf("2026-08-12", "2026-11-11")).toBe("fresh");
  });

  it("dit `aging` dès les 3 mois, jusqu'à la veille de l'an", () => {
    expect(kbisAgeOf("2026-08-11", "2026-11-11")).toBe("aging");
    expect(kbisAgeOf("2025-11-12", "2026-11-11")).toBe("aging");
  });

  it("dit `stale` dès l'an révolu", () => {
    expect(kbisAgeOf("2025-11-11", "2026-11-11")).toBe("stale");
  });

  it("ramène une fin de mois au dernier jour du mois visé", () => {
    // 30 novembre + 3 mois = 28 février (2027 n'est pas bissextile).
    expect(kbisAgeOf("2026-11-30", "2027-02-27")).toBe("fresh");
    expect(kbisAgeOf("2026-11-30", "2027-02-28")).toBe("aging");
  });
});
