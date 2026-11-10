import { localToInstant } from "@lfd/contracts";

import { procedureCodeOf, procedureCodeOfDay } from "../collection-procedure-code.js";

function midnightOf(day: string): Date {
  const instant = localToInstant(day, "00:00");
  if (instant === null) {
    throw new TypeError(`jour invalide : ${day}`);
  }
  return instant;
}

describe("le code court d'une procédure de prélèvement", () => {
  it("dit le jour de clôture (AAMMJJ) et la lettre du rythme", () => {
    expect(procedureCodeOfDay("2026-10-31", ["monthly"])).toBe("PRL-261031-M");
    expect(procedureCodeOfDay("2026-11-02", ["weekly"])).toBe("PRL-261102-H");
    expect(procedureCodeOfDay("2026-11-16", ["semimonthly"])).toBe("PRL-261116-B");
  });

  it("trie les lettres quand une clôture réunit plusieurs rythmes", () => {
    expect(procedureCodeOfDay("2026-10-31", ["monthly", "semimonthly"])).toBe("PRL-261031-BM");
    expect(procedureCodeOfDay("2026-11-01", ["weekly", "monthly", "semimonthly"])).toBe(
      "PRL-261101-BHM",
    );
  });

  it("n'écrit une lettre qu'une fois", () => {
    expect(procedureCodeOfDay("2026-10-31", ["monthly", "monthly"])).toBe("PRL-261031-M");
  });

  it("n'invente pas de rythme quand aucun n'est connu", () => {
    expect(procedureCodeOfDay("2026-10-31", [])).toBe("PRL-261031");
  });

  it("prend le jour de Paris de l'instant de clôture, pas le jour UTC", () => {
    // Minuit à Paris le 1er novembre est encore le 31 octobre en UTC.
    expect(procedureCodeOf(midnightOf("2026-11-01"), ["monthly"])).toBe("PRL-261101-M");
  });
});
