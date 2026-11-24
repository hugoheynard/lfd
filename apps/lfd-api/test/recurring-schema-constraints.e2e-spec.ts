/**
 * E2E — **ce que la base refuse d'elle-même** dans le schéma `recurring` et
 * sur la provenance d'une commande (migration
 * `20261125090000_le_bloc_des_paniers_recurrents`, plan
 * `plan-bloc-recurrent.md`, § 8 bis).
 *
 * Les `CHECK` et le déclencheur ne se voient pas dans le schéma Prisma, ni
 * donc dans `schema-drift` : c'est cette suite qui les prouve. Chaque forme
 * interdite est tentée en SQL brut — le seul chemin qui ne passe pas par le
 * domaine, celui qu'une correction à la main prendrait — et doit être refusée
 * sous le NOM de sa contrainte. Les formes admises voisines passent, pour que
 * le refus ne soit pas celui d'une ligne mal écrite.
 */
import { OccurrencePlacement } from "../src/recurring/channels/commerce/index.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const DAY = serviceDay(14);
const PLACE_ON = serviceDay(7);

/** Les colonnes d'un panier valide, en SQL ; `overrides` remplace une valeur littérale. */
function basketSql(id: string, overrides: Readonly<Record<string, string>> = {}): string {
  const columns: Record<string, string> = {
    id: `'${id}'`,
    buyer_user_id: "'user_1'",
    cadence: "'weekly'",
    status: "'active'",
    start_date: `'${DAY}'`,
    end_date: "NULL",
    fulfillment_method: "'pickup'",
    delivery_address: "NULL",
    pickup_address_id: "NULL",
    requested_window: `'{"start":"07:00","end":"08:00"}'`,
    sales_terms_key: "'salesTermsPro'",
    sales_terms_revision: "1",
    sales_terms_next_revision: "NULL",
    sales_terms_next_file_id: "NULL",
    sales_terms_effective_on: "NULL",
    created_at: "now()",
    updated_at: "now()",
    ...overrides,
  };
  const names = Object.keys(columns).map((name) => `"${name}"`);
  return `INSERT INTO "recurring"."basket" (${names.join(", ")}) VALUES (${Object.values(columns).join(", ")})`;
}

/** Les colonnes d'une échéance `planned` valide du panier `b_ok`. */
function occurrenceSql(id: string, overrides: Readonly<Record<string, string>> = {}): string {
  const columns: Record<string, string> = {
    id: `'${id}'`,
    basket_id: "'b_ok'",
    service_day: `'${DAY}'`,
    place_on: `'${PLACE_ON}'`,
    state: "'planned'",
    lines: "NULL",
    order_id: "NULL",
    cause: "NULL",
    reason: "NULL",
    settled_at: "NULL",
    created_at: "now()",
    updated_at: "now()",
    ...overrides,
  };
  const names = Object.keys(columns).map((name) => `"${name}"`);
  return `INSERT INTO "recurring"."occurrence" (${names.join(", ")}) VALUES (${Object.values(columns).join(", ")})`;
}

const run = (sql: string): Promise<number> => ctx.prisma.$executeRawUnsafe(sql);

describe("le panier", () => {
  it("la forme admise passe", async () => {
    await expect(run(basketSql("b_ok"))).resolves.toBe(1);
  });

  it.each([
    ["une cadence inconnue", { cadence: "'daily'" }, "basket_cadence_known"],
    ["un statut inconnu", { status: "'deleted'" }, "basket_status_known"],
    ["une fin avant le début", { end_date: `'${serviceDay(1)}'` }, "basket_dates_ordered"],
    ["une livraison sans adresse", { fulfillment_method: "'delivery'" }, "basket_routing_shape"],
    [
      "une livraison avec un point de retrait",
      {
        fulfillment_method: "'delivery'",
        delivery_address: `'{"ligne1":"1 rue"}'`,
        pickup_address_id: "'point_1'",
      },
      "basket_routing_shape",
    ],
    [
      "un retrait avec une adresse",
      { delivery_address: `'{"ligne1":"1 rue"}'` },
      "basket_routing_shape",
    ],
    [
      "une version annoncée sans date d'effet",
      { sales_terms_next_revision: "2" },
      "basket_next_terms_together",
    ],
    [
      "une date d'effet sans version annoncée",
      { sales_terms_effective_on: `'${DAY}'` },
      "basket_next_terms_together",
    ],
    [
      "un PDF annoncé sans version",
      { sales_terms_next_file_id: "'file_2'" },
      "basket_next_terms_together",
    ],
  ])("refuse %s", async (_, overrides, constraint) => {
    await expect(run(basketSql("b_bad", overrides))).rejects.toThrow(constraint);
  });

  it("refuse un panier sans CGV acceptées ni créneau (NOT NULL)", async () => {
    await expect(run(basketSql("b_bad", { sales_terms_key: "NULL" }))).rejects.toThrow(
      "sales_terms_key",
    );
    await expect(run(basketSql("b_bad", { requested_window: "NULL" }))).rejects.toThrow(
      "requested_window",
    );
  });
});

describe("ses lignes", () => {
  beforeEach(async () => {
    await run(basketSql("b_ok"));
  });

  const line = (id: string, position: number, sku: string, quantity: number): string =>
    `INSERT INTO "recurring"."basket_line" ("id", "basket_id", "position", "sku", "quantity") VALUES ('${id}', 'b_ok', ${String(position)}, '${sku}', ${String(quantity)})`;

  it("refuse une quantité nulle et un rang négatif", async () => {
    await expect(run(line("l1", 0, "VIE-001-1", 0))).rejects.toThrow(
      "basket_line_quantity_positive",
    );
    await expect(run(line("l1", -1, "VIE-001-1", 1))).rejects.toThrow(
      "basket_line_position_not_negative",
    );
  });

  it("refuse un SKU deux fois, et un rang deux fois, dans le même panier", async () => {
    await run(line("l1", 0, "VIE-001-1", 1));
    await expect(run(line("l2", 1, "VIE-001-1", 1))).rejects.toThrow(
      "basket_line_basket_id_sku_key",
    );
    await expect(run(line("l3", 0, "CRO-002-1", 1))).rejects.toThrow(
      "basket_line_basket_id_position_key",
    );
  });

  it("refuse une ligne d'un panier qui n'existe pas", async () => {
    await expect(
      run(line("l1", 0, "VIE-001-1", 1).replace("'b_ok'", "'b_absent'")),
    ).rejects.toThrow("basket_line_basket_id_fkey");
  });
});

describe("ses échéances", () => {
  beforeEach(async () => {
    await run(basketSql("b_ok"));
  });

  it("les formes admises passent, dont une échéance refusée puis annulée qui garde sa cause", async () => {
    await expect(run(occurrenceSql("o_planned"))).resolves.toBe(1);
    await expect(
      run(
        occurrenceSql("o_cancelled", {
          service_day: `'${serviceDay(21)}'`,
          place_on: `'${serviceDay(14)}'`,
          state: "'cancelled'",
          cause: "'unavailable_sku'",
          reason: "'Indisponible.'",
          settled_at: "now()",
        }),
      ),
    ).resolves.toBe(1);
  });

  it.each([
    ["un état inconnu", { state: "'done'" }, "occurrence_state_known"],
    [
      "une passation après le jour servi",
      { place_on: `'${serviceDay(15)}'` },
      "occurrence_placed_before_served",
    ],
    [
      "une échéance passée sans commande",
      { state: "'placed'", settled_at: "now()" },
      "occurrence_state_shape",
    ],
    [
      "une échéance passée qui garde une cause",
      { state: "'placed'", order_id: "'ord_1'", cause: "'x'", reason: "'x'", settled_at: "now()" },
      "occurrence_state_shape",
    ],
    [
      "une échéance passée sans heure d'issue",
      { state: "'placed'", order_id: "'ord_1'" },
      "occurrence_state_shape",
    ],
    [
      "une échéance refusée sans cause",
      { state: "'refused'", settled_at: "now()" },
      "occurrence_state_shape",
    ],
    [
      "une échéance manquée qui porte une commande",
      { state: "'missed'", order_id: "'ord_1'", cause: "'x'", reason: "'x'", settled_at: "now()" },
      "occurrence_state_shape",
    ],
    [
      "une échéance prévue avec une heure d'issue",
      { settled_at: "now()" },
      "occurrence_state_shape",
    ],
    [
      "une échéance sautée avec une cause",
      { state: "'skipped'", cause: "'x'", reason: "'x'" },
      "occurrence_state_shape",
    ],
    [
      "une échéance annulée avec une cause sans phrase",
      { state: "'cancelled'", cause: "'x'" },
      "occurrence_state_shape",
    ],
    [
      "une échéance sautée qui garde des lignes",
      { state: "'skipped'", lines: `'[{"sku":"VIE-001-1","quantity":1}]'` },
      "occurrence_skipped_without_lines",
    ],
  ])("refuse %s", async (_, overrides, constraint) => {
    await expect(run(occurrenceSql("o_bad", overrides))).rejects.toThrow(constraint);
  });

  it("refuse un second jour identique pour le même panier", async () => {
    await run(occurrenceSql("o_1"));
    await expect(run(occurrenceSql("o_2"))).rejects.toThrow("occurrence_basket_id_service_day_key");
  });

  it("refuse une échéance d'un panier qui n'existe pas", async () => {
    await expect(run(occurrenceSql("o_1", { basket_id: "'b_absent'" }))).rejects.toThrow(
      "occurrence_basket_id_fkey",
    );
  });
});

/** Le déclencheur `orders_keep_recurring_provenance` : l'unicité lit la provenance. */
describe("la provenance d'une commande", () => {
  async function placedOrder(): Promise<string> {
    const pickupId = await pickupSite(ctx.prisma);
    const companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { grantedTerms: ["monthly"] },
    });
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|provenance" });
    await attachTo(ctx.prisma, buyer.id, companyId, CustomerRole.owner);
    const outcome = await ctx.app.get(OccurrencePlacement).place({
      basketId: "b_provenance",
      serviceDay: serviceDay(7),
      buyerUserId: buyer.id,
      companyId,
      routing: {
        method: "pickup",
        deliveryAddress: null,
        pickupAddressId: pickupId,
        window: { start: "07:00", end: "08:00" },
      },
      lines: [{ sku: "VIE-001-1", quantity: 2 }],
      note: "",
      deltas: { added: [], removed: [] },
      salesTerms: { key: "salesTermsPro", revision: 1, fileId: null },
    });
    if (outcome.kind !== "placed") {
      throw new TypeError(`la passation de la scène a été refusée : ${outcome.reason}`);
    }
    return outcome.orderId;
  }

  it("refuse de changer le panier ou le jour d'une commande, et de les effacer", async () => {
    const orderId = await placedOrder();
    const update = (set: string): Promise<number> =>
      run(`UPDATE "public"."orders" SET ${set} WHERE "id" = '${orderId}'`);

    await expect(update(`"from_subscription_id" = 'b_autre'`)).rejects.toThrow(
      "La provenance récurrente d'une commande ne se modifie pas",
    );
    await expect(update(`"from_occurrence_day" = '${serviceDay(14)}'`)).rejects.toThrow(
      "La provenance récurrente d'une commande ne se modifie pas",
    );
    await expect(update(`"from_occurrence_day" = NULL`)).rejects.toThrow(
      "La provenance récurrente d'une commande ne se modifie pas",
    );
    // Réécrire la même valeur n'est pas un changement.
    await expect(update(`"from_subscription_id" = 'b_provenance'`)).resolves.toBe(1);
  });
});
