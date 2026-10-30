import {
  assertBackfillTarget,
  backfillReport,
  parseBackfillArgs,
} from "../backfill-order-discounts-options.js";

/**
 * La reprise des remises (plan des promotions, § 18.3, Q-M1) : à blanc par
 * défaut, cible locale seulement, sauf `--production` ET le nom de la base
 * retapé. Le rapport liste chaque commande qui demande un regard.
 */

const LOCAL = "postgresql://lfd:lfd@localhost:5433/lfc_b2b";
const REMOTE = "postgres://user:secret@pooled.db.prisma.io:5432/lfd_prod?sslmode=require";

describe("les options", () => {
  it("à blanc par défaut", () => {
    expect(parseBackfillArgs([])).toEqual({ write: false, production: null });
  });

  it("--write écrit ; le `--` de pnpm est ignoré", () => {
    expect(parseBackfillArgs(["--", "--write"])).toEqual({ write: true, production: null });
  });

  it("--production prend le nom retapé", () => {
    expect(parseBackfillArgs(["--production", "lfd_prod", "--write"])).toEqual({
      write: true,
      production: "lfd_prod",
    });
  });

  it("--production sans nom est refusé", () => {
    expect(() => parseBackfillArgs(["--production"])).toThrow(/nom de la base/);
    expect(() => parseBackfillArgs(["--production", "--write"])).toThrow(/nom de la base/);
  });

  it("une option inconnue est refusée", () => {
    expect(() => parseBackfillArgs(["--force"])).toThrow(/Option inconnue/);
  });
});

describe("la cible", () => {
  it("une base locale passe sans --production", () => {
    expect(() => assertBackfillTarget(LOCAL, { write: true, production: null })).not.toThrow();
  });

  it("une base distante sans --production est refusée", () => {
    expect(() => assertBackfillTarget(REMOTE, { write: false, production: null })).toThrow(
      /--production/,
    );
  });

  it("une base distante avec le bon nom retapé passe", () => {
    expect(() =>
      assertBackfillTarget(REMOTE, { write: false, production: "lfd_prod" }),
    ).not.toThrow();
  });

  it("un nom retapé qui n'est pas celui de l'URL est refusé", () => {
    expect(() => assertBackfillTarget(REMOTE, { write: true, production: "lfd_dev" })).toThrow(
      /cible « lfd_prod »/,
    );
  });
});

describe("le rapport", () => {
  it("compte, liste les frozen, les commandes à trancher et les désaccords", () => {
    const report = backfillReport(
      [
        { orderNumber: "ORD-1", outcome: { kind: "computed", gap: null } },
        {
          orderNumber: "ORD-2",
          outcome: { kind: "frozen", gap: "remise recomposée 1 c HT, figée 2 c HT" },
        },
        { orderNumber: "ORD-3", outcome: { kind: "undecided", reason: "commande à 2 taux" } },
      ],
      [{ orderNumber: "ORD-4", discountCents: 300, activeCents: 250 }],
      false,
    );

    expect(report).toEqual([
      "Reprise des remises — À BLANC (rien n'est écrit)",
      "  3 commande(s) remisée(s) sans remise active",
      "  computed 1 · frozen 1 · à trancher 1 · illisibles 0 · reprises entre-temps 0",
      "  ORD-2 — frozen : remise recomposée 1 c HT, figée 2 c HT",
      "  ORD-3 — à trancher (rien d'écrit) : commande à 2 taux",
      "  1 commande(s) dont les remises actives ne somment plus discount_cents :",
      "  ORD-4 — remises actives 250 c, discount_cents 300 c",
    ]);
  });
});
