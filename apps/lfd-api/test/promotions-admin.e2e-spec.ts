/**
 * E2E de **l'écran Promotions** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lots L7-L8), sur le vrai Postgres et le vrai catalogue semé :
 *
 * 1. le verrou d'avant la bascule — en `legacy`, toute écriture rend 409, la
 *    lecture dit « non éditable » ;
 * 2. les droits — `b2b_pricing` pour écrire TOUTE promotion, « retrait à un
 *    point » compris (un seul endroit, décision de Hugo du 2026-10-31,
 *    `documentation/promotions/plan-un-seul-endroit.md`), `b2b_pricing` OU
 *    `lfc_site_settings` pour lire ;
 * 3. les refus nommés après la bascule — chevauchement (l'autre promotion et
 *    l'article), deux promotions de panier, produit entier au point ligne.
 *
 * Les fenêtres sont relatives (`daysAgo`) : la liste compare l'état à
 * l'horloge.
 */
import type {
  PromotionListView,
  PromotionTermsPayload,
  PromotionView,
  StaffResource,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Le jeton porteur EST le `sub` du staff : chaque personne semée a le sien. */
const subjectAsToken = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: AdminTokenVerifier, value: subjectAsToken }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const PROMOTIONS = "/admin/promotions";
const AT_COEUR_LIST = "/admin/promotions?pickupId=pk_coeur";
const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une personne du rôle `role`, plus les dérogations dites — et son agent. */
async function staffWith(
  sub: string,
  role: "communication" | "commercial",
  grants: readonly { resource: StaffResource; action: "read" | "write" }[],
): Promise<ReturnType<E2eContext["asSub"]>> {
  const person = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  for (const grant of grants) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: person.id, ...grant, effect: "allow" },
    });
  }
  return ctx.asSub(sub);
}

function terms(over: Partial<PromotionTermsPayload> = {}): PromotionTermsPayload {
  return {
    internalName: "Croissants d'automne",
    label: { fr: "−20 % sur le croissant", en: null, it: null },
    reason: null,
    effect: { kind: "percent_off", value: 2000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: daysAgo(1),
    validTo: null,
    audienceLabels: { individuals: null, pros: null },
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: { kind: "any", pickupId: null },
    scope: { mode: "only", rules: [{ target: "variant", targetId: "VIE-001-1", eligible: true }] },
    conditions: [],
    ...over,
  };
}

/** Le corps d'un refus, tel que `AppErrorFilter` l'écrit. */
function refusalOf(response: Parameters<typeof jsonBody>[0]): { code: string; message: string } {
  return jsonBody<{ code: string; message: string }>(response);
}

const AT_COEUR_POINT = { kind: "pickup_point", pickupId: "pk_coeur" } as const;

/** Une autre déclinaison que celle de `terms()`, pour que deux poses ne se disputent rien. */
const VIE_002: PromotionTermsPayload["scope"] = {
  mode: "only",
  rules: [{ target: "variant", targetId: "VIE-002-1", eligible: true }],
};

// L12 : « avant la bascule, l'écran est en lecture seule » est retiré avec
// l'ancien chemin — la source ne vaut plus que `promotions` (CHECK).

describe("les droits — un seul endroit", () => {
  it("la lecture s'ouvre à b2b_pricing OU lfc_site_settings ; l'écriture, à b2b_pricing seul", async () => {
    const pricingReader = await staffWith("pricing-reader", "communication", [
      { resource: "b2b_pricing", action: "read" },
    ]);
    await pricingReader.get(PROMOTIONS).expect(200);
    await pricingReader.post(PROMOTIONS).send(terms()).expect(403);

    const settingsReader = await staffWith("settings-reader", "communication", [
      { resource: "lfc_site_settings", action: "read" },
    ]);
    await settingsReader.get(PROMOTIONS).expect(200);
    await settingsReader.get(AT_COEUR_LIST).expect(200);

    const nobody = await staffWith("nobody", "communication", []);
    await nobody.get(PROMOTIONS).expect(403);
  });

  it("le tarifeur pose toute promotion, celle d'un point de retrait comprise", async () => {
    const pricer = await staffWith("pricer", "communication", [
      { resource: "b2b_pricing", action: "write" },
    ]);
    await pricer.post(PROMOTIONS).send(terms()).expect(201);
    await pricer
      .post(PROMOTIONS)
      .send(terms({ fulfillment: AT_COEUR_POINT, internalName: "Cœur", scope: VIE_002 }))
      .expect(201);
  });

  /**
   * Le droit qui bouge (plan-un-seul-endroit.md § 4) : le réglage d'un site
   * réglait la remise de SON point jusqu'au 2026-10-31. Il ne la règle plus.
   */
  it("lfc_site_settings:write sans b2b_pricing:write reçoit 403, même pour un point", async () => {
    const siteKeeper = await staffWith("site-keeper", "communication", [
      { resource: "lfc_site_settings", action: "write" },
    ]);
    await siteKeeper
      .post(PROMOTIONS)
      .send(terms({ fulfillment: AT_COEUR_POINT, internalName: "Cœur" }))
      .expect(403);
  });

  it("l'ancienne route d'un site n'existe plus", async () => {
    await admin().get("/admin/sites/pk_coeur/promotions").expect(404);
    await admin()
      .post("/admin/sites/pk_coeur/promotions")
      .send(terms({ fulfillment: AT_COEUR_POINT }))
      .expect(404);
  });
});

describe("après la bascule — les refus nommés", () => {
  /**
   * RÉÉCRIT en L8b (2026-10-30) : « un autre public coexiste » posait `pros
   * actifs` contre `tout le monde`, que l'ancien refus (même `kind`) laissait
   * passer. Le chevauchement se juge désormais sur les COUVERTURES (§ 15.6) :
   * seul un public disjoint coexiste, et `pros` contre `pros actifs` est
   * refusé (vitruve n° 3, S4).
   */
  it("refuse le chevauchement en nommant l'autre promotion, le public commun et l'article", async () => {
    const individuals = [{ kind: "individuals", companyId: null }] as const;
    await admin()
      .post(PROMOTIONS)
      .send(terms({ audiences: [...individuals] }))
      .expect(201);
    const refused = await admin()
      .post(PROMOTIONS)
      .send(terms({ internalName: "Doublon", audiences: [...individuals] }))
      .expect(409);
    expect(refusalOf(refused)).toMatchObject({ code: "promotions.overlapping" });
    expect(refusalOf(refused).message).toContain(
      "« Croissants d'automne » vise déjà les particuliers et couvre « Croissant »",
    );
    // Un public disjoint coexiste.
    await admin()
      .post(PROMOTIONS)
      .send(
        terms({
          internalName: "Pros actifs",
          audiences: [{ kind: "pros_active", companyId: null }],
        }),
      )
      .expect(201);
    // `pros` couvre les pros actifs : refusé.
    const pros = await admin()
      .post(PROMOTIONS)
      .send(
        terms({ internalName: "Tous les pros", audiences: [{ kind: "pros", companyId: null }] }),
      )
      .expect(409);
    expect(refusalOf(pros).message).toContain("« Pros actifs » vise déjà les pros actifs");
  });

  it("ramène le public à sa forme canonique et filtre l'écran par société (L8b)", async () => {
    const created = await admin()
      .post(PROMOTIONS)
      .send(
        terms({
          audiences: [
            { kind: "individuals_guest", companyId: null },
            { kind: "individuals_registered", companyId: null },
            { kind: "company", companyId: "co_e2e" },
          ],
          audienceLabels: {
            individuals: { fr: "Pour vous", en: null, it: null },
            pros: { fr: "Pour la maison", en: null, it: null },
          },
        }),
      )
      .expect(201);
    const id = jsonBody<{ id: string }>(created).id;
    await admin()
      .post(PROMOTIONS)
      .send(terms({ internalName: "Pros", audiences: [{ kind: "pros_active", companyId: null }] }))
      .expect(201);

    const filtered = jsonBody<PromotionListView>(
      await admin().get(`${PROMOTIONS}?companyId=co_e2e`).expect(200),
    );
    expect(filtered.promotions.map((promotion) => promotion.id)).toEqual([id]);
    expect(filtered.promotions[0]).toMatchObject({
      audiences: [
        { kind: "individuals", companyId: null },
        { kind: "company", companyId: "co_e2e" },
      ],
      audience: { kind: "several", companyId: null },
      audienceLabels: { pros: { fr: "Pour la maison" } },
    });
    const other = jsonBody<PromotionListView>(
      await admin().get(`${PROMOTIONS}?companyId=co_autre`).expect(200),
    );
    expect(other.promotions).toEqual([]);
  });

  it("refuse un public vide et un libellé d'une audience que le public ne touche pas", async () => {
    await admin()
      .post(PROMOTIONS)
      .send(terms({ audiences: [] }))
      .expect(400);
    const label = await admin()
      .post(PROMOTIONS)
      .send(
        terms({
          audiences: [{ kind: "pros", companyId: null }],
          audienceLabels: { individuals: { fr: "Hors sujet", en: null, it: null }, pros: null },
        }),
      )
      .expect(400);
    expect(refusalOf(label)).toMatchObject({ code: "promotions.audience_label_without_audience" });
  });

  it("refuse une seconde promotion de panier qui s'appliquerait à la même commande", async () => {
    await admin()
      .post(PROMOTIONS)
      .send(
        terms({
          internalName: "Cœur pros",
          fulfillment: AT_COEUR_POINT,
          audiences: [{ kind: "pros_active", companyId: null }],
        }),
      )
      .expect(201);
    const refused = await admin()
      .post(PROMOTIONS)
      .send(
        terms({
          internalName: "Tout retrait pros",
          fulfillment: { kind: "pickup", pickupId: null },
          audiences: [{ kind: "pros", companyId: null }],
          scope: {
            mode: "only",
            rules: [{ target: "variant", targetId: "PAI-001-1", eligible: true }],
          },
        }),
      )
      .expect(409);
    expect(refusalOf(refused)).toMatchObject({ code: "promotions.basket_would_combine" });
    expect(refusalOf(refused).message).toContain("« Cœur pros »");
  });

  it("refuse un produit entier au point ligne", async () => {
    const productId = (
      await ctx.prisma.catalogItem.findFirstOrThrow({
        where: { sku: "VIE-001-1" },
        select: { productId: true },
      })
    ).productId;
    const byProduct = await admin()
      .post(PROMOTIONS)
      .send(
        terms({
          scope: {
            mode: "only",
            rules: [{ target: "product", targetId: productId, eligible: true }],
          },
        }),
      )
      .expect(400);
    expect(refusalOf(byProduct)).toMatchObject({ code: "promotions.product_target_at_line" });
    expect(refusalOf(byProduct).message).toContain("Visez la famille ou la déclinaison");
  });

  it("la fiche relit la promotion, cibles nommées, et la liste se restreint au point", async () => {
    const created = jsonBody<{ id: string }>(
      await admin().post(PROMOTIONS).send(terms()).expect(201),
    );
    await admin()
      .post(PROMOTIONS)
      .send(terms({ internalName: "Cœur", fulfillment: AT_COEUR_POINT }))
      .expect(201);

    const view = jsonBody<PromotionView>(
      await admin().get(`${PROMOTIONS}/${created.id}`).expect(200),
    );
    expect(view).toMatchObject({ state: "active", applicationPoint: "line" });
    expect(view.scope.rules).toEqual([
      { target: "variant", targetId: "VIE-001-1", eligible: true, name: "Croissant" },
    ]);

    const atPoint = jsonBody<PromotionListView>(await admin().get(AT_COEUR_LIST).expect(200));
    expect(atPoint.editable).toBe(true);
    expect(atPoint.promotions.map((promotion) => promotion.internalName)).toEqual(["Cœur"]);
    await admin().get(`${PROMOTIONS}/absente`).expect(404);
  });

  it("modifie par les routes, motif au journal ; une révision qui quitte le point passe", async () => {
    const created = jsonBody<{ id: string }>(
      await admin()
        .post(PROMOTIONS)
        .send(terms({ fulfillment: AT_COEUR_POINT }))
        .expect(201),
    );
    await admin()
      .put(`${PROMOTIONS}/${created.id}`)
      .send({
        terms: terms({ fulfillment: AT_COEUR_POINT, effect: { kind: "percent_off", value: 2500 } }),
        reason: "on monte à 25 %",
      })
      .expect(204);
    const view = jsonBody<PromotionView>(
      await admin().get(`${PROMOTIONS}/${created.id}`).expect(200),
    );
    expect(view.effect).toEqual({ kind: "percent_off", value: 2500 });
    await admin()
      .put(`${PROMOTIONS}/${created.id}`)
      .send({ terms: terms(), reason: "tous acheminements" })
      .expect(204);
    const moved = jsonBody<PromotionView>(
      await admin().get(`${PROMOTIONS}/${created.id}`).expect(200),
    );
    expect(moved.fulfillment).toEqual({ kind: "any", pickupId: null });
  });

  it("suspend, reprend et archive la promotion d'un point par les routes de l'écran", async () => {
    const created = jsonBody<{ id: string }>(
      await admin()
        .post(PROMOTIONS)
        .send(terms({ fulfillment: AT_COEUR_POINT }))
        .expect(201),
    );
    await admin().post(`${PROMOTIONS}/${created.id}/pause`).send({}).expect(204);
    await admin().post(`${PROMOTIONS}/${created.id}/resume`).send({}).expect(204);
    await admin()
      .post(`${PROMOTIONS}/${created.id}/archive`)
      .send({ reason: "fin de saison" })
      .expect(204);
    const events = await ctx.prisma.pricingEvent.findMany({
      where: { subjectType: "promotion", subjectId: created.id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(events.map((event) => event.act)).toEqual(["posed", "paused", "resumed", "archived"]);
  });
});
