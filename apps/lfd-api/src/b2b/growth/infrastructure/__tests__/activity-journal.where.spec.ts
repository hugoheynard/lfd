import { activityWhereOf, escapeLike } from "../activity-journal.where.js";

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
    expect(where.values).toEqual(["%50\\%'; --%", "%50\\%'; --%", "50%'; --"]);
  });

  it("combine la recherche aux autres filtres, curseur compris", () => {
    const where = activityWhereOf({
      limit: 50,
      module: "equipe",
      q: "Cécile",
      before: "01K00000000000000000000000",
    });

    expect(where.sql).toContain("starts_with(type,");
    expect(where.sql).toContain("ILIKE");
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
