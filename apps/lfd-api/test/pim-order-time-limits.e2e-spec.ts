/**
 * E2E des **points d'arrêt de prise de commande** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve, et qu'aucun double ne peut jouer :
 * - l'**unicité par portée** tenue par un index sur `coalesce(scope_id, '')` —
 *   un `UNIQUE (scope_type, scope_id)` nu laisserait passer deux règles
 *   globales, Postgres tenant chaque `NULL` pour distinct ;
 * - la contrainte `CHECK` qui refuse une portée contradictoire même écrite
 *   hors du domaine ;
 * - le `PUT` sans identifiant : la **portée** est la clé, et reposer dessus
 *   remplace au lieu de créer un second avis.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const LIMITS = "/pim/order-time-limits";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

interface LimitRow {
  readonly id: string;
  readonly scope: { readonly type: string; readonly id: string | null };
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
}

async function list(): Promise<readonly LimitRow[]> {
  return jsonBody<readonly LimitRow[]>(await staff().get(LIMITS).expect(200));
}

describe("poser une limite", () => {
  it("crée la règle globale, puis la REMPLACE au lieu d'en créer une seconde", async () => {
    const first = jsonBody<{ id: string }>(
      await staff()
        .put(LIMITS)
        .send({ scope: { type: "global", id: null }, daysBefore: 1, time: "18:00" })
        .expect(200),
    );

    const second = jsonBody<{ id: string }>(
      await staff()
        .put(LIMITS)
        .send({ scope: { type: "global", id: null }, daysBefore: 1, time: "16:00" })
        .expect(200),
    );

    // Le MÊME identifiant : un changement d'heure ne fait pas disparaître la
    // ligne pour en créer une autre sous les yeux de qui la regardait.
    expect(second.id).toBe(first.id);

    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.time).toBe("16:00");
  });

  it("garde les portées distinctes côte à côte", async () => {
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "global", id: null }, daysBefore: 1, time: "18:00" })
      .expect(200);
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "category", id: "patisserie" }, time: "16:00" })
      .expect(200);

    expect(await list()).toHaveLength(2);
  });

  it("refuse une portée qui se contredit", async () => {
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "global", id: "patisserie" }, time: "16:00" })
      .expect(400);
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "product", id: null }, time: "16:00" })
      .expect(400);

    expect(await list()).toHaveLength(0);
  });

  it("refuse une règle qui ne dit rien", async () => {
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "global", id: null } })
      .expect(400);
    expect(await list()).toHaveLength(0);
  });
});

describe("retirer une limite", () => {
  it("supprime la ligne — c'est le geste pour dire « ce rang ne se prononce pas »", async () => {
    const created = jsonBody<{ id: string }>(
      await staff()
        .put(LIMITS)
        .send({ scope: { type: "category", id: "patisserie" }, time: "16:00" })
        .expect(200),
    );

    await staff().delete(`${LIMITS}/${created.id}`).expect(204);
    expect(await list()).toHaveLength(0);
  });

  it("404 sur une règle qui n'existe pas", async () => {
    await staff().delete(`${LIMITS}/inexistant`).expect(404);
  });

  /**
   * 🔴 Le verrou, éprouvé de bout en bout : l'héritage étant champ par champ,
   * une famille qui ne pose que l'heure emprunte son délai au global. Retirer
   * le global la rendrait MUETTE — pas plus permissive — et l'écran
   * continuerait de l'afficher comme si elle s'appliquait.
   *
   * Ce que seul l'e2e prouve ici : le refus traverse le contrôleur avec le bon
   * statut, et la règle est TOUJOURS là après. Un refus qui supprime quand même
   * serait pire que pas de refus.
   */
  it("refuse de retirer le rang global quand une règle inférieure en dépend", async () => {
    const global = jsonBody<{ id: string }>(
      await staff()
        .put(LIMITS)
        .send({ scope: { type: "global", id: null }, daysBefore: 1, time: "18:00" })
        .expect(200),
    );
    // Une heure, pas de délai : elle ne se suffit pas.
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "category", id: "patisserie" }, time: "16:00" })
      .expect(200);

    const refusal = await staff().delete(`${LIMITS}/${global.id}`).expect(409);

    expect(refusal.body).toMatchObject({ code: "pim.order_time_limit.global_still_needed" });
    expect(await list()).toHaveLength(2);
  });

  it("laisse retirer le rang global quand chaque autre règle se suffit", async () => {
    const global = jsonBody<{ id: string }>(
      await staff()
        .put(LIMITS)
        .send({ scope: { type: "global", id: null }, daysBefore: 1, time: "18:00" })
        .expect(200),
    );
    // Délai ET heure : celle-là ne doit rien au rang du dessus.
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "category", id: "patisserie" }, daysBefore: 2, time: "16:00" })
      .expect(200);

    await staff().delete(`${LIMITS}/${global.id}`).expect(204);
    expect(await list()).toHaveLength(1);
  });
});

describe("ce que la base refuse, même hors du domaine", () => {
  /**
   * **Régression par construction : deux règles globales.**
   *
   * `@@unique([scopeType, scopeId])` de Prisma ne l'aurait pas empêché —
   * Postgres tient chaque `NULL` pour distinct, et la résolution serait devenue
   * dépendante de l'ordre de lecture. C'est l'index sur `coalesce(scope_id, '')`
   * qui porte la garantie, et il ne se teste qu'ici.
   */
  it("refuse une SECONDE règle globale insérée en direct", async () => {
    await ctx.prisma.orderTimeLimit.create({
      data: { id: "l1", scopeType: "global", scopeId: null, daysBefore: 1, time: "18:00" },
    });

    await expect(
      ctx.prisma.orderTimeLimit.create({
        data: { id: "l2", scopeType: "global", scopeId: null, daysBefore: 2, time: "16:00" },
      }),
    ).rejects.toThrow();
  });

  it("refuse une portée contradictoire insérée en direct", async () => {
    await expect(
      ctx.prisma.orderTimeLimit.create({
        data: { id: "l3", scopeType: "global", scopeId: "patisserie", time: "18:00" },
      }),
    ).rejects.toThrow();
  });
});
