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
 *   remplace au lieu de créer un second avis ;
 * - depuis le 2026-10-21 (décision de Hugo, `limites-de-commande/
 *   schema-des-reglages.md` §4) : une limite par PRODUIT, règle entière, sans
 *   rattrapage — refusée autrement par le domaine ET par la base.
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

const PRODUCT = { type: "product", id: "prd_e2e" } as const;

describe("poser une limite", () => {
  it("crée la limite d'un produit, puis la REMPLACE au lieu d'en créer une seconde", async () => {
    const first = jsonBody<{ id: string }>(
      await staff().put(LIMITS).send({ scope: PRODUCT, daysBefore: 1, time: "18:00" }).expect(200),
    );

    const second = jsonBody<{ id: string }>(
      await staff().put(LIMITS).send({ scope: PRODUCT, daysBefore: 1, time: "16:00" }).expect(200),
    );

    // Le MÊME identifiant : un changement d'heure ne fait pas disparaître la
    // ligne pour en créer une autre sous les yeux de qui la regardait.
    expect(second.id).toBe(first.id);

    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.time).toBe("16:00");
  });

  it("garde deux produits côte à côte", async () => {
    await staff().put(LIMITS).send({ scope: PRODUCT, daysBefore: 1, time: "18:00" }).expect(200);
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "product", id: "prd_autre" }, daysBefore: 2, time: "12:00" })
      .expect(200);

    expect(await list()).toHaveLength(2);
  });

  /** Lot B du plan des phrases (2026-09-19) : la portée se fige en mots au journal. */
  it("fige au journal la portée en mots", async () => {
    await staff().put(LIMITS).send({ scope: PRODUCT, daysBefore: 1, time: "18:00" }).expect(200);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "order_time_limit.set" },
      select: { payload: true },
    });

    expect(facts.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ subjectLabel: "Produit prd_e2e", scope: "product:prd_e2e" }),
    ]);
  });

  /**
   * Décision de Hugo du 2026-10-21 : « toute la production » se règle dans
   * Réglages › Commandes › Heure limite ; une famille n'a plus de limite ; une
   * déclinaison suit son produit. Le refus nomme où aller.
   */
  it.each([
    ["global", null],
    ["category", "patisserie"],
    ["variant", "var_e2e"],
  ] as const)("refuse la portée %s, en disant où se règle la générale", async (type, id) => {
    const refusal = await staff()
      .put(LIMITS)
      .send({ scope: { type, id }, daysBefore: 1, time: "18:00" })
      .expect(400);

    expect(refusal.body).toMatchObject({ code: "pim.order_time_limit.scope_retired" });
    expect(JSON.stringify(refusal.body)).toContain("Réglages › Commandes › Heure limite");
    expect(await list()).toHaveLength(0);
  });

  it("refuse une limite de produit sans délai ou sans heure", async () => {
    const refusal = await staff().put(LIMITS).send({ scope: PRODUCT, time: "16:00" }).expect(400);

    expect(refusal.body).toMatchObject({ code: "pim.order_time_limit.incomplete" });
    expect(await list()).toHaveLength(0);
  });

  /** Point 2 (2026-10-21) : le seul rattrapage est celui de la règle générale. */
  it("refuse un rattrapage sur une limite de produit", async () => {
    const refusal = await staff()
      .put(LIMITS)
      .send({ scope: PRODUCT, daysBefore: 1, time: "18:00", graceMinutes: 30 })
      .expect(400);

    expect(refusal.body).toMatchObject({ code: "pim.order_time_limit.grace_retired" });
    expect(await list()).toHaveLength(0);
  });

  it("refuse une portée qui se contredit", async () => {
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "product", id: null }, daysBefore: 1, time: "16:00" })
      .expect(400);

    expect(await list()).toHaveLength(0);
  });
});

describe("retirer une limite", () => {
  it("supprime la ligne — le produit n'a plus de limite propre", async () => {
    const created = jsonBody<{ id: string }>(
      await staff().put(LIMITS).send({ scope: PRODUCT, daysBefore: 1, time: "16:00" }).expect(200),
    );

    await staff().delete(`${LIMITS}/${created.id}`).expect(204);
    expect(await list()).toHaveLength(0);
  });

  it("404 sur une règle qui n'existe pas", async () => {
    await staff().delete(`${LIMITS}/inexistant`).expect(404);
  });
});

describe("la règle générale du commerce, en lecture", () => {
  const GENERAL = `${LIMITS}/general-cutoff`;

  it("dit qu'il n'y en a pas quand le commerce n'en a aucune", async () => {
    expect(jsonBody(await staff().get(GENERAL).expect(200))).toEqual({ enabled: true, rule: null });
  });

  it("montre la règle par défaut, et dit quand l'interrupteur la coupe", async () => {
    await staff()
      .put("/admin/order-cutoffs/general")
      .send({ pickupAddressId: null, weekday: null, daysBefore: 1, time: "18:00", graceMinutes: 0 })
      .expect(204);

    expect(jsonBody(await staff().get(GENERAL).expect(200))).toEqual({
      enabled: true,
      rule: { daysBefore: 1, time: "18:00", graceMinutes: 0 },
    });

    await staff().patch("/admin/order-cutoff-settings").send({ enabled: false }).expect(204);

    expect(jsonBody(await staff().get(GENERAL).expect(200))).toMatchObject({ enabled: false });
  });
});

describe("ce que la base refuse, même hors du domaine", () => {
  /**
   * **Régression par construction : deux limites sur le même produit.** C'est
   * l'index sur `coalesce(scope_id, '')` qui porte la garantie.
   */
  it("refuse une SECONDE limite du même produit insérée en direct", async () => {
    await ctx.prisma.orderTimeLimit.create({
      data: { id: "l1", scopeType: "product", scopeId: "prd_e2e", daysBefore: 1, time: "18:00" },
    });

    await expect(
      ctx.prisma.orderTimeLimit.create({
        data: { id: "l2", scopeType: "product", scopeId: "prd_e2e", daysBefore: 2, time: "16:00" },
      }),
    ).rejects.toThrow();
  });

  /** `order_time_limit_product_only` et `order_time_limit_no_grace` (2026-10-21). */
  it("refuse une limite globale ou un rattrapage insérés en direct", async () => {
    await expect(
      ctx.prisma.orderTimeLimit.create({
        data: { id: "l3", scopeType: "global", scopeId: null, daysBefore: 1, time: "18:00" },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.orderTimeLimit.create({
        data: {
          id: "l4",
          scopeType: "product",
          scopeId: "prd_e2e",
          daysBefore: 1,
          time: "18:00",
          graceMinutes: 30,
        },
      }),
    ).rejects.toThrow();
  });
});
