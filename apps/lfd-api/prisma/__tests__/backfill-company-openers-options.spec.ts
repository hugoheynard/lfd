import {
  assertOpenerBackfillTarget,
  openerBackfillReport,
  parseOpenerBackfillArgs,
} from "../backfill-company-openers-options.js";

/**
 * La reprise de l'auteur des fiches (`plan-suivi-commercial.md`, § 3.1) : à
 * blanc par défaut, cible locale seulement, sauf `--production` ET le nom de
 * la base retapé ; le rapport dit d'abord combien de faits ont un acteur.
 */

const LOCAL = "postgresql://lfd:lfd@localhost:5433/lfc_b2b";
const REMOTE = "postgres://user:secret@pooled.db.prisma.io:5432/lfd_prod?sslmode=require";

describe("les options de la reprise de l'auteur", () => {
  it("à blanc par défaut ; le `--` de pnpm est ignoré", () => {
    expect(parseOpenerBackfillArgs([])).toEqual({ write: false, production: null });
    expect(parseOpenerBackfillArgs(["--", "--write"])).toEqual({ write: true, production: null });
  });

  it("--production prend le nom retapé, et le refuse absent", () => {
    expect(parseOpenerBackfillArgs(["--production", "lfd_prod"])).toEqual({
      write: false,
      production: "lfd_prod",
    });
    expect(() => parseOpenerBackfillArgs(["--production"])).toThrow(/nom de la base/);
    expect(() => parseOpenerBackfillArgs(["--force"])).toThrow(/Option inconnue/);
  });

  it("refuse une base distante sans --production, et un nom retapé faux", () => {
    expect(() => assertOpenerBackfillTarget(REMOTE, { write: false, production: null })).toThrow(
      /Cible refusée/,
    );
    expect(() => assertOpenerBackfillTarget(REMOTE, { write: false, production: "autre" })).toThrow(
      /rien n'est lancé/,
    );
    expect(() =>
      assertOpenerBackfillTarget(REMOTE, { write: false, production: "lfd_prod" }),
    ).not.toThrow();
    expect(() =>
      assertOpenerBackfillTarget(LOCAL, { write: true, production: null }),
    ).not.toThrow();
  });
});

describe("le rapport de la reprise de l'auteur", () => {
  it("à blanc, dit le compte des acteurs puis chaque fiche, sans compte d'écriture", () => {
    const report = openerBackfillReport(
      { staff: 2, withActor: 1 },
      [
        {
          kind: "fill",
          companyId: "a",
          reference: "C-AAAAAA",
          declaredByStaffId: "staff_lou",
          declaredByName: null,
          followedByStaffId: "staff_lou",
        },
        { kind: "skip", companyId: "b", reference: "C-BBBBBB", reason: "no-actor" },
      ],
      null,
    );
    expect(report[0]).toMatch(/À BLANC/);
    expect(report[1]).toMatch(/2 déclaration\(s\) staff .* dont 1 avec un acteur/);
    expect(report).toContain("  C-AAAAAA — auteur staff_lou (nom inconnu), suivie par lui");
    expect(report).toContain("  C-BBBBBB — vide : fait staff sans acteur (auteur inconnu)");
    expect(report.some((line) => line.includes("écrite(s)"))).toBe(false);
  });

  it("en écriture, dit combien de fiches ont été écrites", () => {
    expect(openerBackfillReport({ staff: 0, withActor: 0 }, [], 0)).toContain(
      "  0 écrite(s) ; les autres l'avaient été entre-temps",
    );
  });
});
