import { randomUUID } from "node:crypto";
/**
 * E2E de **la version par journée** — `documentation/caching-usage/version-par-journee.md`,
 * lots V1 et V2, sur le vrai Postgres jetable.
 *
 * Le cœur du lot V1 : chaque écrivain CONNU d'une journée fait avancer la
 * version du bon journal — le commerce (`public.day_change`) ou le fournil
 * (`production.day_change`). Aucun code applicatif ne l'avance : ce sont les
 * déclencheurs de la base (D1). Si un geste passe ici sans faire bouger la
 * version, un écran resterait figé sans le dire — c'est ce que cette suite
 * est là pour voir.
 *
 * La version se lit par la porte unique `GET admin/day-versions` (D8,
 * 2026-11-03), qui a remplacé les routes par journal du lot V2 ; ses droits,
 * journal par journal, sont éprouvés à la fin.
 */
import type { OpenedPackingContainer } from "@lfd/contracts";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { settleCardPayments } from "./card-payments.js";
import { cardGatewayDouble } from "./order-factory.js";
import { DAY_VERSIONS, dayVersionOf, dayVersionsOf } from "./day-versions-door.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { placeLateByStaff } from "./staff-late-order.js";
import { createUser } from "./factories.js";
import { packingOrderPath } from "./production-day-fixture.js";
import { openQualityControl } from "./quality-control-settings.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const MEMBER = "auth0|member-day-version";
const DAY = serviceDay();
const OTHER_DAY = serviceDay(8);
const CROISSANT = "VIE-001-1";
const BAGUETTE = "PAI-001-1";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const fakeGateway = cardGatewayDouble("pi_e2e_version");
/** Les intentions émises par le prestataire doublé — `settleCardPayments` les règle et vide la file. */
const issuedIntents = fakeGateway.provider.issued;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  issuedIntents.splice(0);
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

type Journal = "commerce" | "production";
/** Le journal du commerce s'appelle `orders` sur le fil. */
const WIRE: Readonly<Record<Journal, "orders" | "production">> = {
  commerce: "orders",
  production: "production",
};

async function version(journal: Journal, day = DAY): Promise<number> {
  return dayVersionOf(staff(), WIRE[journal], day);
}

/**
 * Joue le geste et rend la version AVANT et APRÈS. On draine : un retrait ou
 * un colisage arrive au commerce par un abonné, hors de la requête.
 */
async function around(journal: Journal, gesture: () => Promise<unknown>) {
  const before = await version(journal);
  await gesture();
  await ctx.drain();
  return { before, after: await version(journal) };
}

type Lines = readonly { sku: string; quantity: number }[];

/** Passe une commande de retrait pour le jour ; `settle` règle sa carte. */
async function place(lines: Lines, settle = true, day = DAY): Promise<string> {
  const point = await ctx.prisma.site.findFirst({ select: { id: true } });
  const pickupAddressId =
    point?.id ?? (await ctx.prisma.site.create({ data: { ...SITE, isDefault: true } })).id;
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        companyId: null,
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        // Pas de commande sans créneau (2026-10-14).
        requestedWindow: { start: "07:00", end: "08:00" },
        pickupAddressId,
        note: "",
        lines,
      })
      .expect(201),
  );
  if (settle) {
    await settleCardPayments(ctx, issuedIntents);
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true },
  });
  return row.id;
}

const close = () => staff().post(`/admin/production/batch/${DAY}/close`).expect(201);

async function planned(orderId: string) {
  return ctx.prisma.productionOrder.findFirstOrThrow({
    where: { serviceDay: DAY, orderId },
    select: { reference: true, lines: { select: { sku: true } } },
  });
}

const bake = (sku: string) =>
  staff()
    .put(`/admin/production/worksheet/${DAY}/lines/${sku}/done`)
    .send({ initials: "KA" })
    .expect(204);

/** Une commande du jour, arrêtée, sa ligne sortie du four : prête au colisage. */
async function readyToPack(): Promise<{ orderId: string; reference: string }> {
  const orderId = await place([{ sku: CROISSANT, quantity: 6 }]);
  await close();
  await bake(CROISSANT);
  // Depuis K2, la journée naît au colisage : la liste à coliser et la remise
  // de la fournée lui arrivent par la boîte d'envoi, hors de la requête.
  await ctx.drain();
  return { orderId, reference: (await planned(orderId)).reference };
}

/** Un sac ouvert au colisage pour la commande — rend son identifiant. */
async function openBag(orderId: string): Promise<string> {
  return jsonBody<OpenedPackingContainer>(
    await staff()
      .post(`${packingOrderPath(orderId, DAY)}/containers`)
      .set(INTENT_KEY, freshIntent())
      .send({ nature: "bag" })
      .expect(201),
  ).containerId;
}

/** Les six croissants de la commande glissés dans le contenant. */
const packLine = (orderId: string, containerId: string) =>
  staff()
    .post(`${packingOrderPath(orderId, DAY)}/containers/${containerId}/lines/${CROISSANT}`)
    .set(INTENT_KEY, freshIntent())
    .send({ quantity: 6 })
    .expect(204);

/** La commande déclarée prête au colisage. */
const packed = (orderId: string) =>
  staff()
    .post(`${packingOrderPath(orderId, DAY)}/close`)
    .expect(204);

describe("le journal du COMMERCE avance à chaque écriture de commande", () => {
  it("passer", async () => {
    const { before, after } = await around("commerce", () =>
      place([{ sku: CROISSANT, quantity: 2 }], false),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("payer", async () => {
    await place([{ sku: CROISSANT, quantity: 2 }], false);
    const { before, after } = await around("commerce", () =>
      settleCardPayments(ctx, issuedIntents),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("annuler (l'abandon du règlement)", async () => {
    const orderId = await place([{ sku: CROISSANT, quantity: 2 }], false);
    const { before, after } = await around("commerce", () =>
      ctx.asSub(MEMBER).post(`/orders/${orderId}/abandon`).expect(204),
    );
    expect(after).toBeGreaterThan(before);
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(row.status).toBe("cancelled");
  });

  it("retirer — par le statut de la commande, sans surveiller `order_handover`", async () => {
    const { orderId } = await readyToPack();
    await packLine(orderId, await openBag(orderId));
    await packed(orderId);
    await ctx.drain();
    const { handoverToken } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { handoverToken: true },
    });

    const { before, after } = await around("commerce", () =>
      staff()
        .post(`/admin/handover/${handoverToken ?? ""}`)
        .expect(201),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("ne touche QUE la journée de la commande", async () => {
    const other = await version("commerce", OTHER_DAY);
    await place([{ sku: CROISSANT, quantity: 2 }]);
    expect(await version("commerce", OTHER_DAY)).toBe(other);
  });

  it("une commande déplacée fait bouger l'ancien ET le nouveau jour", async () => {
    const orderId = await place([{ sku: CROISSANT, quantity: 2 }]);
    const [day, other] = [await version("commerce"), await version("commerce", OTHER_DAY)];

    // Aucun geste de l'application ne déplace encore une commande : le
    // déclencheur est éprouvé directement, puisque c'est lui qui le garantit.
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { requestedDeliveryDate: new Date(`${OTHER_DAY}T00:00:00.000Z`) },
    });

    expect(await version("commerce")).toBeGreaterThan(day);
    expect(await version("commerce", OTHER_DAY)).toBeGreaterThan(other);
  });
});

describe("le journal du FOURNIL avance à chaque geste du fournil", () => {
  it("clôturer — une ligne par journée et par instruction, pas une par ligne insérée", async () => {
    await place([
      { sku: CROISSANT, quantity: 4 },
      { sku: BAGUETTE, quantity: 2 },
    ]);
    await place([
      { sku: CROISSANT, quantity: 3 },
      { sku: BAGUETTE, quantity: 1 },
    ]);
    await place([{ sku: CROISSANT, quantity: 5 }]);
    const journal = () => ctx.prisma.productionDayChange.count({ where: { serviceDay: DAY } });
    const traces = await journal();

    const { before, after } = await around("production", close);

    expect(after).toBeGreaterThan(before);
    const inserted =
      (await ctx.prisma.productionOrder.count({ where: { serviceDay: DAY } })) +
      (await ctx.prisma.productionOrderLine.count({ where: { order: { serviceDay: DAY } } })) +
      (await ctx.prisma.productionCount.count({ where: { serviceDay: DAY } }));
    // 3 commandes + 5 lignes + 2 comptes = 10 lignes insérées ; le journal en
    // reçoit bien moins, parce que le déclencheur est d'INSTRUCTION.
    expect(inserted).toBe(10);
    expect((await journal()) - traces).toBeLessThan(inserted);
  });

  it("cocher une ligne de la fiche d'atelier", async () => {
    await place([{ sku: CROISSANT, quantity: 6 }]);
    await close();
    const { before, after } = await around("production", () => bake(CROISSANT));
    expect(after).toBeGreaterThan(before);
  });

  it("glisser une ligne dans un contenant, au colisage", async () => {
    const { orderId } = await readyToPack();
    const bag = await openBag(orderId);
    const { before, after } = await around("production", () => packLine(orderId, bag));
    expect(after).toBeGreaterThan(before);
  });

  it("ouvrir un contenant, au colisage", async () => {
    const { orderId } = await readyToPack();
    const { before, after } = await around("production", () => openBag(orderId));
    expect(after).toBeGreaterThan(before);
  });

  it("fermer le sac — et le commerce l'apprend aussi (la commande passe prête)", async () => {
    const { orderId } = await readyToPack();
    await packLine(orderId, await openBag(orderId));
    const commerce = await version("commerce");
    const { before, after } = await around("production", () => packed(orderId));
    expect(after).toBeGreaterThan(before);
    expect(await version("commerce")).toBeGreaterThan(commerce);
  });

  it("retirer à nouveau (le retirage)", async () => {
    await place([{ sku: CROISSANT, quantity: 6 }]);
    await close();
    // Un client ne passe plus après l'arrêt (O3, §8.3) : la retardataire est saisie par l'équipe.
    await placeLateByStaff(ctx, DAY, [{ sku: BAGUETTE, quantity: 2 }]);
    const { before, after } = await around("production", () =>
      staff().post(`/admin/production/worksheet/${DAY}/retake`).expect(201),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("contrôler la qualité", async () => {
    await place([{ sku: CROISSANT, quantity: 6 }]);
    await close();
    // Le contrôle au fournil est désactivé par défaut (Réglages › Commandes, 2026-10-26).
    await openQualityControl(ctx);
    const { before, after } = await around("production", () =>
      staff()
        .post(`/admin/supervision/quality/checks`)
        .send({
          id: `01JQV${randomUUID().replace(/-/gu, "").slice(0, 21).toUpperCase()}`,
          serviceDay: DAY,
          target: { kind: "line", sku: CROISSANT },
          verdict: "ok",
          note: null,
          uploadIds: [],
        })
        .expect(201),
    );
    expect(after).toBeGreaterThan(before);
  });
});

describe("la porte unique des versions de journée (D8)", () => {
  /** Une fiche `communication` : ni commandes, ni supervision par son rôle. */
  async function communicationStaff(sub: string): Promise<string> {
    const row = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: sub,
        email: `${sub}@lfc.test`,
        role: "communication",
        status: "active",
        auth0Id: sub,
      },
    });
    return row.id;
  }

  async function allowRead(
    sub: string,
    resource:
      | "b2b_supervision"
      | "b2b_orders"
      | "production_plan"
      | "production_worksheet"
      | "production_packing"
      | "handover_counter",
  ) {
    const staffUserId = await communicationStaff(sub);
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId, resource, action: "read", effect: "allow" },
    });
  }

  /** Les journaux que cette fiche reçoit quand elle les demande tous. */
  async function journalsOf(sub: string): Promise<readonly string[]> {
    const view = await dayVersionsOf(ctx.asSub(sub), DAY, [
      "orders",
      "production",
      "delivery",
      "my-round",
    ]);
    return Object.keys(view.versions).sort();
  }

  it("rend zéro pour une journée que rien n'a touchée", async () => {
    expect(await version("commerce")).toBe(0);
    expect(await version("production")).toBe(0);
  });

  it("rend les journaux demandés en UNE réponse, aux mêmes valeurs qu'un par un", async () => {
    await place([{ sku: CROISSANT, quantity: 2 }]);
    await close();
    await ctx.drain();

    const view = await dayVersionsOf(staff(), DAY, ["orders", "production"]);

    expect(view.versions).toEqual({
      orders: await version("commerce"),
      production: await version("production"),
    });
    expect(view.versions.orders).toBeGreaterThan(0);
    expect(view.versions.production).toBeGreaterThan(0);
  });

  /** La Supervision montre aussi la place des livraisons dans leurs tournées. */
  it("`b2b_supervision:read` reçoit le commerce, le fournil et la livraison", async () => {
    await allowRead("staff-version-supervision", "b2b_supervision");
    expect(await journalsOf("staff-version-supervision")).toEqual([
      "delivery",
      "orders",
      "production",
    ]);
  });

  /**
   * Depuis le 2026-10-01 (`plan-droits-par-geste.md`, DG-D1), la version du
   * fournil s'ouvre à n'importe lequel des quatre gestes du fournil et du
   * retrait — et plus à `b2b_orders:read`, qui ne les porte plus.
   */
  it.each(["production_plan", "production_worksheet", "production_packing"] as const)(
    "`%s:read` reçoit le fournil, pas le commerce",
    async (resource) => {
      await allowRead(`staff-version-${resource}`, resource);
      expect(await journalsOf(`staff-version-${resource}`)).toEqual(["production"]);
    },
  );

  /**
   * Régression : le transfert qu'un livreur dépose au point de retrait
   * n'apparaissait au comptoir qu'au filet de 5 min (journal `delivery` non suivi).
   */
  it("`handover_counter:read` reçoit le commerce, le fournil et la livraison", async () => {
    await allowRead("staff-version-retrait", "handover_counter");
    expect(await journalsOf("staff-version-retrait")).toEqual(["delivery", "orders", "production"]);
  });

  it("🔴 qui n'a que le droit du commerce ne reçoit PAS `production` — sans refus de la porte", async () => {
    await place([{ sku: CROISSANT, quantity: 2 }]);
    await allowRead("staff-version-commandes", "b2b_orders");

    const view = await dayVersionsOf(ctx.asSub("staff-version-commandes"), DAY, [
      "orders",
      "production",
    ]);

    expect(view.versions).toEqual({ orders: await version("commerce") });
    expect(view.versions.orders).toBeGreaterThan(0);
  });

  it("rend une réponse vide, sans refus, à une fiche sans aucun droit de journal", async () => {
    await communicationStaff("staff-version-sans-droit");
    expect(await journalsOf("staff-version-sans-droit")).toEqual([]);
  });

  it("refuse un journal inconnu en le nommant", async () => {
    const response = await staff()
      .get(`${DAY_VERSIONS}?date=${DAY}&journals=orders,stock`)
      .expect(400);
    expect(JSON.stringify(response.body)).toContain("stock");
  });

  it("refuse une date absente ou mal formée, et une liste absente", async () => {
    await staff().get(`${DAY_VERSIONS}?journals=orders`).expect(400);
    await staff().get(`${DAY_VERSIONS}?date=03/10/2026&journals=orders`).expect(400);
    await staff().get(`${DAY_VERSIONS}?date=${DAY}`).expect(400);
  });

  /** Retirées le 2026-11-03 (D8) : une seule porte, pour ne pas dériver. */
  it.each([
    "/admin/supervision/version",
    "/admin/orders/day-version",
    "/admin/supervision/production-version",
    "/admin/production/version",
    "/admin/delivery/version",
    "/admin/delivery/my-round/version",
  ])("l'ancienne route %s n'existe plus (404)", async (route) => {
    await staff().get(`${route}?date=${DAY}`).expect(404);
  });

  /**
   * Le Prod manager montre la vue par tranche (2026-11-01) : la fiche datée se
   * LIT sous `production_plan:read`, comme les échéances ; le geste « sorti »
   * reste au fournil.
   */
  it("la fiche datée se lit sous `production_plan:read`, sans ouvrir la case « sorti »", async () => {
    await allowRead("staff-prevision-fiche", "production_plan");
    const planner = ctx.asSub("staff-prevision-fiche");
    await planner.get(`/admin/production/worksheet?date=${DAY}`).expect(200);
    await planner
      .put(`/admin/production/worksheet/${DAY}/lines/${CROISSANT}/done`)
      .send({ initials: "PM" })
      .expect(403);
  });
});
