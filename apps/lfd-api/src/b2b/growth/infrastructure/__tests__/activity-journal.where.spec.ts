import { TAX_JOURNAL_SLICE } from "../../domain/activity-slice.js";
import { activitySnapshotWhereOf, activityWhereOf, escapeLike } from "../activity-journal.where.js";

describe("escapeLike — un joker tapé dans la recherche reste un caractère", () => {
  it("échappe `%`, `_` et l'échappement lui-même", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("staff_user")).toBe("staff\\_user");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("laisse intact un texte sans joker", () => {
    expect(escapeLike("Cécile Martin 06 11")).toBe("Cécile Martin 06 11");
  });
});

describe("activityWhereOf — un seul jeu de filtres, en paramètres liés", () => {
  it("sans filtre, ne restreint rien", () => {
    expect(activityWhereOf({ limit: 50 }).sql).toBe("TRUE");
  });

  it("ne concatène jamais le texte cherché : il part en paramètre, jokers échappés", () => {
    const where = activityWhereOf({ limit: 50, q: "50%'; --" });

    expect(where.sql).not.toContain("50%");
    // Le motif (jokers échappés) et le sujet exact partent en paramètres, comme
    // la table des accents — rien du texte cherché n'entre dans le SQL.
    expect(where.values).toContain("%50\\%'; --%");
    expect(where.values).toContain("50%'; --");
  });

  it("compare sans accents ni casse, et ne lit que les valeurs de la charge", () => {
    const where = activityWhereOf({ limit: 50, q: "Cécile" });

    expect(where.sql).toContain("lower(translate(");
    expect(where.sql).toContain("jsonb_path_query_array(payload");
    expect(where.sql).not.toContain("payload::text");
  });

  it("combine la recherche aux autres filtres, curseur compris", () => {
    const where = activityWhereOf({
      limit: 50,
      module: "equipe",
      q: "Cécile",
      before: "01K00000000000000000000000",
    });

    expect(where.sql).toContain("starts_with(type,");
    expect(where.sql).toContain("LIKE");
    expect(where.sql).toContain("id < ?");
    expect(where.sql.match(/ AND /g)).toHaveLength(2);
  });
});

describe("activityWhereOf — le filtre par acteur ne coupe pas une histoire", () => {
  it("sans synonymes connus, ne vise que l'acteur demandé", () => {
    const where = activityWhereOf({ limit: 50, actorId: "staff_1" });

    expect(where.sql).toBe("actor_id IN (?)");
    expect(where.values).toEqual(["staff_1"]);
  });

  it("vise l'id de fiche ET tous les `sub` que la personne a portés", () => {
    // Plan `architecture-journalisation.md` §12, D4 : pendant la bascule, un même
    // membre du staff a écrit sous son `sub` puis sous l'id de sa fiche.
    const where = activityWhereOf({ limit: 50, actorId: "auth0|ancien" }, [
      "auth0|ancien",
      "staff_1",
      "auth0|actuel",
    ]);

    expect(where.sql).toBe("actor_id IN (?,?,?)");
    expect(where.values).toEqual(["auth0|ancien", "staff_1", "auth0|actuel"]);
  });

  it("garde toujours l'acteur demandé, même absent des synonymes", () => {
    const where = activityWhereOf({ limit: 50, actorId: "staff_1" }, ["auth0|actuel"]);

    expect(where.values).toEqual(["staff_1", "auth0|actuel"]);
  });
});

describe("activityWhereOf — l'instantané d'une pagination numérotée", () => {
  const ANCHOR = "01K00000000000000000000009";

  it("borne à l'ancre et à ce qui la précède, en paramètre lié", () => {
    const where = activityWhereOf({ limit: 50 }, null, ANCHOR);

    expect(where.sql).toBe("id <= ?");
    expect(where.values).toEqual([ANCHOR]);
  });

  it("combine l'ancre aux filtres, à la recherche et au curseur", () => {
    const where = activityWhereOf(
      { limit: 50, module: "equipe", q: "Cécile", before: "01K00000000000000000000005" },
      null,
      ANCHOR,
    );

    expect(where.sql).toContain("id <= ?");
    expect(where.sql).toContain("id < ?");
    expect(where.sql).toContain("LIKE");
    expect(where.sql.match(/ AND /g)).toHaveLength(3);
  });
});

/**
 * Le `WHERE` du total : les mêmes filtres que la page, l'ancre comprise, le
 * curseur NON — un total qui dépendrait du curseur rétrécirait à chaque page.
 */
describe("activitySnapshotWhereOf — le total compte l'instantané, pas la page", () => {
  const ANCHOR = "01K00000000000000000000009";

  it("garde filtres, recherche et ancre, et ignore le curseur", () => {
    const query = {
      limit: 50,
      module: "equipe" as const,
      q: "Cécile",
      before: "01K00000000000000000000005",
    };

    const snapshot = activitySnapshotWhereOf(query, null, ANCHOR);

    expect(snapshot.sql).toContain("starts_with(type,");
    expect(snapshot.sql).toContain("LIKE");
    expect(snapshot.sql).toContain("id <= ?");
    expect(snapshot.sql).not.toContain("id < ?");
    expect(snapshot.values).not.toContain("01K00000000000000000000005");
  });

  it("partage les filtres de la page, acteur élargi compris", () => {
    const query = { limit: 50, actorId: "staff_1" };

    const page = activityWhereOf(query, ["auth0|actuel"], ANCHOR);
    const snapshot = activitySnapshotWhereOf(query, ["auth0|actuel"], ANCHOR);

    expect(snapshot.sql).toBe(page.sql);
    expect(snapshot.values).toEqual(page.values);
  });

  it("sans ancre ni filtre, ne restreint rien — c'est la recherche de l'ancre", () => {
    expect(activitySnapshotWhereOf({ limit: 50 }).sql).toBe("TRUE");
  });
});

/**
 * La tranche fiscale (plan du journal, lot 4, 2026-09-19) : un bord posé par le
 * serveur, que les filtres de l'appelant ne peuvent que resserrer.
 */
describe("activityWhereOf — une tranche bornée au serveur", () => {
  const ANCHOR = "01K00000000000000000000009";
  const SLICE_SQL = "(type = ? OR type = ? OR starts_with(type, ?) OR starts_with(type, ?))";

  it("pose la tranche seule quand l'appelant ne filtre rien", () => {
    const where = activityWhereOf({ limit: 50 }, null, null, TAX_JOURNAL_SLICE);

    expect(where.sql).toBe(SLICE_SQL);
    expect(where.values).toEqual([
      "product_category.vat_changed",
      "product.vat_changed",
      "vat_rate.",
      "accounting_rules.",
    ]);
  });

  it("la joint par AND à chaque filtre, jamais par OR", () => {
    const where = activityWhereOf(
      {
        limit: 50,
        module: "comptes",
        q: "taux",
        subjectId: "company_1",
        actorId: "staff_1",
        before: "01K00000000000000000000005",
      },
      ["auth0|actuel"],
      ANCHOR,
      TAX_JOURNAL_SLICE,
    );

    // La tranche en tête, entre parenthèses : aucun `OR` de la recherche ni du
    // module ne peut s'y accrocher.
    expect(where.sql.startsWith(`${SLICE_SQL} AND `)).toBe(true);
    // Tranche, module, sujet, acteur, recherche, ancre, curseur : sept clauses.
    expect(where.sql.match(/\) AND |\? AND /g)).toHaveLength(6);
  });

  it("borne aussi le total et la recherche de l'ancre", () => {
    const snapshot = activitySnapshotWhereOf(
      { limit: 50, q: "taux" },
      null,
      ANCHOR,
      TAX_JOURNAL_SLICE,
    );

    expect(snapshot.sql.startsWith(`${SLICE_SQL} AND `)).toBe(true);
    expect(activitySnapshotWhereOf({ limit: 50 }, null, null, TAX_JOURNAL_SLICE).sql).toBe(
      SLICE_SQL,
    );
  });

  it("ne laisse rien passer d'une tranche vide — elle n'ouvre pas le journal", () => {
    const where = activityWhereOf({ limit: 50 }, null, null, { types: [], prefixes: [] });

    expect(where.sql).toBe("FALSE");
  });
});
