/**
 * E2E des **suggestions décidées par le staff** (RS1 et RS3 de
 * `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la ligne écrite et relue (tableau de
 * SKU, jours en `DATE`, phrase en trois colonnes), les CHECK, le fait de
 * journal dans la transaction, l'ordre réglé appliqué par la lecture des
 * règles applicables, et le mur `lfc_suggestions`.
 *
 * RS6 : les résultats estimés — compteurs `staff` filtrés en base, ventes
 * agrégées par la commande (jour de passation à Paris, ni annulée, ni saisie
 * par le staff), plafond des ajouts et prix HT moyen.
 */
import { lineTotalCents } from "@lfd/money";
import type {
  StaffSuggestionCountersView,
  StaffSuggestionOrderView,
  StaffSuggestionResultsView,
  StaffSuggestionRulePayload,
  StaffSuggestionRuleView,
} from "@lfd/contracts";

import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OrderClientele, OrderStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { E2E_FAMILIES } from "./catalog-fixture.js";
import { createUser } from "./factories.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";

const SUGGESTIONS = "/admin/suggestions";

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

/** « Croissant au panier → baguette », de aujourd'hui à dans une semaine — relatif à maintenant. */
function croissantRule(over: Partial<StaffSuggestionRulePayload> = {}): StaffSuggestionRulePayload {
  return {
    trigger: { kind: "product_in_cart", ref: "VIE-001" },
    suggestedSkus: ["PAI-001"],
    placement: "cart",
    audience: "both",
    startsOn: serviceDay(0),
    endsOn: serviceDay(7),
    phrase: { fr: "Avec un croissant, la baguette", it: "Con un cornetto" },
    priority: 0,
    ...over,
  };
}

const admin = () => ctx.asSub(E2E_STAFF_SUB);

async function create(body: StaffSuggestionRulePayload): Promise<string> {
  const response = await admin().post(SUGGESTIONS).send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function list(): Promise<readonly StaffSuggestionRuleView[]> {
  return jsonBody<StaffSuggestionRuleView[]>(await admin().get(SUGGESTIONS).expect(200));
}

async function applicable(query: string): Promise<readonly string[]> {
  const response = await admin().get(`${SUGGESTIONS}/applicable?${query}`).expect(200);
  return jsonBody<StaffSuggestionRuleView[]>(response).map((rule) => rule.id);
}

/** Des gestes `staff` sur une règle, envoyés comme la boutique les envoie (sans jeton). */
async function beacon(ruleId: string, sku: string, event: string, times: number): Promise<void> {
  const events = Array.from({ length: times }, () => ({
    sku,
    event,
    placement: ruleId.toLowerCase(),
    source: "staff",
  }));
  await request(ctx.app.getHttpServer()).post("/shop/audience").send({ events }).expect(204);
}

let orderSeq = 0;

/**
 * Une commande passée maintenant (horloge du serveur) d'une seule ligne.
 * Écrite par Prisma, faute de factory de domaine côté commerce (dette de
 * `factories.ts`) : seule la ligne et son statut comptent ici.
 */
async function seedSale(
  sku: string,
  quantity: number,
  unitPriceMillicents: number,
  over: { readonly status?: OrderStatus; readonly byStaff?: boolean } = {},
): Promise<void> {
  orderSeq += 1;
  const author = await createUser(ctx.prisma, {
    auth0Sub: `auth0|resultats-${String(orderSeq)}`,
    email: `resultats-${String(orderSeq)}@example.test`,
  });
  const total = lineTotalCents(unitPriceMillicents, quantity);
  await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-RESULTATS-${String(orderSeq)}`,
      placedByUserId: author.id,
      placedByStaffId: over.byStaff === true ? E2E_STAFF_ID : null,
      clientele: OrderClientele.public,
      status: over.status ?? OrderStatus.placed,
      fulfillmentMethod: "pickup",
      subtotalCents: total,
      totalCents: total,
      createdAt: ctx.app.get(Clock).now(),
      lines: {
        create: [
          { sku, productNameSnapshot: sku, unitPriceMillicents, quantity, lineTotalCents: total },
        ],
      },
    },
  });
}

describe("les suggestions décidées", () => {
  it("crée une règle, la relit telle quelle, et la journalise au nom de son auteur", async () => {
    const id = await create(croissantRule());

    expect(await list()).toEqual([
      expect.objectContaining({
        id,
        audienceKey: id.toLowerCase(),
        trigger: { kind: "product_in_cart", ref: "VIE-001" },
        suggestedSkus: ["PAI-001"],
        startsOn: serviceDay(0),
        endsOn: serviceDay(7),
        phrase: { fr: "Avec un croissant, la baguette", it: "Con un cornetto" },
        active: true,
        archivedAt: null,
      }),
    ]);
    const row = await ctx.prisma.staffSuggestionRule.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ createdBy: E2E_STAFF_ID, updatedBy: E2E_STAFF_ID });
    const facts = await ctx.prisma.activityEvent.findMany({ where: { subjectId: id } });
    expect(facts.map((fact) => fact.type)).toEqual(["staff_suggestion.created"]);
  });

  it("refuse en nommant le cas : article inconnu, famille inconnue, déclencheur suggéré, fin passée", async () => {
    const refused = async (body: StaffSuggestionRulePayload, code: string) => {
      const response = await admin().post(SUGGESTIONS).send(body).expect(400);
      expect(response.body).toMatchObject({ code });
    };
    await refused(croissantRule({ suggestedSkus: ["ZZZ-404"] }), "suggestions.catalogue_unknown");
    await refused(
      croissantRule({ trigger: { kind: "category_in_cart", ref: "fam-404" } }),
      "suggestions.catalogue_unknown",
    );
    await refused(
      croissantRule({ suggestedSkus: ["VIE-001"] }),
      "suggestions.suggested_is_trigger",
    );
    await refused(
      croissantRule({ startsOn: serviceDay(-7), endsOn: serviceDay(-1) }),
      "suggestions.period_over",
    );
    await refused(
      croissantRule({ trigger: { kind: "product_viewed", ref: "VIE-001" } }),
      "suggestions.placement_mismatch",
    );
    expect(await list()).toEqual([]);
  });

  it("accepte une famille servie, la coupe puis l'archive — archivée, elle ne s'écrit plus", async () => {
    const id = await create(
      croissantRule({ trigger: { kind: "category_in_cart", ref: E2E_FAMILIES.VIE.id } }),
    );
    await admin().put(`${SUGGESTIONS}/${id}/active`).send({ active: false }).expect(200);
    await admin().put(`${SUGGESTIONS}/${id}/archive`).expect(200);

    const [archived] = await list();
    expect(archived).toMatchObject({ id, active: false });
    expect(archived?.archivedAt).not.toBeNull();
    const again = await admin().put(`${SUGGESTIONS}/${id}`).send(croissantRule()).expect(409);
    expect(again.body).toMatchObject({ code: "suggestions.archived" });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "staff_suggestion.created",
      "staff_suggestion.deactivated",
      "staff_suggestion.archived",
    ]);
  });

  it("applique la période, l'audience et l'ordre réglé — récente, puis priorité", async () => {
    const older = await create(croissantRule({ priority: 9 }));
    const newer = await create(croissantRule({ priority: 1 }));
    await create(croissantRule({ audience: "public" }));
    await create(croissantRule({ startsOn: serviceDay(1), endsOn: serviceDay(7) }));

    expect(await applicable("placement=cart&audience=pro")).toEqual([newer, older]);

    await admin().put(`${SUGGESTIONS}/order`).send({ order: "priority" }).expect(204);
    const order = jsonBody<StaffSuggestionOrderView>(
      await admin().get(`${SUGGESTIONS}/order`).expect(200),
    );
    expect(order.order).toBe("priority");
    expect(await applicable("placement=cart&audience=pro")).toEqual([older, newer]);
    expect(await applicable("placement=home")).toEqual([]);
  });

  it("rend des chiffres à zéro pour une règle que la boutique n'a pas encore montrée", async () => {
    const id = await create(croissantRule());
    const day = serviceDay(0);
    const response = await admin().get(`${SUGGESTIONS}/counters?from=${day}&to=${day}`).expect(200);
    expect(jsonBody<StaffSuggestionCountersView[]>(response)).toEqual([
      { ruleId: id, shown: 0, clicked: 0, added: 0 },
    ]);
  });

  it("estime les commandées au plafond des ajouts, et le CA au prix HT moyen du jour (RS6)", async () => {
    const id = await create(croissantRule());
    await beacon(id, "PAI-001", "suggestion_shown", 4);
    await beacon(id, "PAI-001", "suggestion_clicked", 2);
    await beacon(id, "PAI-001", "suggestion_added", 2);
    // 3 baguettes à 1,20 € HT : 360 c. Ni l'annulée, ni la saisie du staff ne comptent.
    await seedSale("PAI-001", 3, 120_000);
    await seedSale("PAI-001", 10, 120_000, { status: OrderStatus.cancelled });
    await seedSale("PAI-001", 10, 120_000, { byStaff: true });
    await seedSale("VIE-001", 5, 100_000);

    const response = await admin().get(`${SUGGESTIONS}/results?days=7`).expect(200);
    const view = jsonBody<StaffSuggestionResultsView>(response);

    expect(view).toMatchObject({ days: 7, to: serviceDay(0) });
    expect(view.rules).toEqual([
      {
        ruleId: id,
        shown: 4,
        clicked: 2,
        added: 2,
        orderedEstimate: 2,
        addRateBasisPoints: 5000,
        revenueEstimateCents: 240,
      },
    ]);
  });

  it("rend 30 jours par défaut et refuse une autre période", async () => {
    const view = jsonBody<StaffSuggestionResultsView>(
      await admin().get(`${SUGGESTIONS}/results`).expect(200),
    );
    expect(view.days).toBe(30);
    await admin().get(`${SUGGESTIONS}/results?days=14`).expect(400);
  });

  it("ferme ses routes à qui n'a pas lfc_suggestions, et l'écriture à qui ne fait que lire", async () => {
    const outsider = await staffWith(ctx, "sans-suggestions", [
      { resource: "b2b_orders", action: "read" },
    ]);
    const reader = await staffWith(ctx, "lecteur-suggestions", [
      { resource: "lfc_suggestions", action: "read" },
    ]);
    await ctx.asSub(outsider).get(SUGGESTIONS).expect(403);
    await ctx.asSub(reader).get(SUGGESTIONS).expect(200);
    await ctx.asSub(outsider).get(`${SUGGESTIONS}/results`).expect(403);
    await ctx.asSub(reader).get(`${SUGGESTIONS}/results`).expect(200);
    await ctx.asSub(reader).post(SUGGESTIONS).send(croissantRule()).expect(403);
    await ctx.asSub(reader).put(`${SUGGESTIONS}/order`).send({ order: "priority" }).expect(403);
  });
});
