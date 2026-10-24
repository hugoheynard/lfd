/**
 * E2E des audiences, lot A3 de
 * `documentation/recommandation-produit/plan-audiences.md` : la langue de la
 * commande et le profil de séjour ESTIMÉ.
 *
 * Ce que seule la base prouve : les signaux calculés par client dans
 * l'agrégat SQL — langue ≠ fr, indicatif lu dans `users.phone` (texte libre),
 * écart entre première et dernière commande, semaines distinctes —, puis la
 * règle du domaine et le seuil appliqués à une vraie réponse.
 */
import { addDays, instantToLocal, localToInstant, type AudiencesView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, payByCard, pickupSite, placeOrder } from "./order-factory.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";

const BAGUETTES = [{ sku: "PAI-001", quantity: 2 }] as const;

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_sejour") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Il y a `days` jours, à 9 h À PARIS — relatif, jamais une date du calendrier. */
function daysAgoMorning(days: number): Date {
  const day = addDays(instantToLocal(ctx.app.get(Clock).now()).day, -days);
  const at = localToInstant(day, "09:00");
  if (at === null) {
    throw new Error("9 h existe tous les jours à Paris");
  }
  return at;
}

interface SeedOrder {
  readonly userId: string;
  readonly daysAgo: number;
  readonly locale?: "fr" | "en" | "it";
  readonly companyId?: string;
}

/**
 * Une commande passée par le vrai chemin (plan T), il y a `daysAgo` jours à 9 h,
 * et réglée : une carte restée en attente serait remplacée par la commande
 * suivante du même particulier.
 */
async function seedOrder(order: SeedOrder): Promise<void> {
  if (order.companyId !== undefined) {
    await attachTo(ctx.prisma, order.userId, order.companyId, CustomerRole.owner);
  }
  const placedAt = daysAgoMorning(order.daysAgo);
  const placed = await placeOrder(ctx, {
    buyerUserId: order.userId,
    companyId: order.companyId ?? null,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    forDay: addDays(instantToLocal(placedAt).day, 1),
    placedAt,
    lines: BAGUETTES,
    ...(order.locale === undefined ? {} : { locale: order.locale }),
  });
  await payByCard(ctx, placed);
}

async function person(phone = ""): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, {
    auth0Sub: `auth0|sejour-${String(seq)}`,
    email: `sejour-${String(seq)}@example.test`,
    phone,
  });
  return user.id;
}

async function cells(dimension: string) {
  const view = jsonBody<AudiencesView>(
    await ctx.asSub("staff-e2e").get(`/admin/audiences?days=30&dimension=${dimension}`).expect(200),
  );
  return new Map(view.segmentations[0]?.cells.map((cell) => [cell.key, cell]));
}

describe("la langue de la commande (A3)", () => {
  it("compte les commandes passées en anglais, et range celles sans langue à part", async () => {
    for (let index = 0; index < 5; index += 1) {
      await seedOrder({ userId: await person(), daysAgo: 1, locale: "en" });
    }
    await seedOrder({ userId: await person(), daysAgo: 1 });

    const byKey = await cells("order_locale");

    expect(byKey.get("en")).toMatchObject({ status: "shown", label: "Anglais", clients: 5 });
    expect(byKey.get("unknown")).toEqual({
      status: "too_few_clients",
      key: "unknown",
      label: "Non renseignée",
    });
    expect(byKey.get("fr")?.status).toBe("too_few_clients");
  });
});

describe("le profil de séjour estimé (A3)", () => {
  it("estime vacancier par la langue OU l'indicatif, sur un séjour court — jamais une société", async () => {
    // Trois en anglais, une commande chacun.
    for (let index = 0; index < 3; index += 1) {
      await seedOrder({ userId: await person(), daysAgo: 2, locale: "en" });
    }
    // Deux sans langue mais à l'indicatif britannique, deux commandes à 3 jours d'écart.
    for (const phone of ["+44 7700 900123", "0044 7700 900456"]) {
      const userId = await person(phone);
      await seedOrder({ userId, daysAgo: 5 });
      await seedOrder({ userId, daysAgo: 2 });
    }
    // Un numéro français, avec ou sans indicatif, ne dit rien d'étranger.
    await seedOrder({ userId: await person("+33 6 12 34 56 78"), daysAgo: 2, locale: "fr" });
    await seedOrder({ userId: await person("06 12 34 56 78"), daysAgo: 2 });
    // Une société qui commande en anglais ne séjourne pas.
    const company = await createCompany(ctx.prisma, { nafCode: "55.10Z" });
    await seedOrder({ userId: await person(), companyId: company.id, daysAgo: 2, locale: "en" });

    const byKey = await cells("stay_profile");

    expect(byKey.get("vacationer")).toMatchObject({
      status: "shown",
      label: "Vacancier (estimé)",
      clients: 5,
      orders: 7,
    });
    expect(byKey.get("undetermined")).toEqual({
      status: "too_few_clients",
      key: "undetermined",
      label: "Indéterminé",
    });
  });

  it("estime résident sur trois semaines distinctes, et masque une case de moins de cinq clients", async () => {
    for (let index = 0; index < 5; index += 1) {
      const userId = await person();
      for (const daysAgo of [1, 8, 15]) {
        await seedOrder({ userId, daysAgo, locale: "fr" });
      }
    }
    // Un étranger présent trois semaines, loin d'un séjour de dix jours : saisonnier, seul.
    const seasonal = await person();
    for (const daysAgo of [1, 12, 22]) {
      await seedOrder({ userId: seasonal, daysAgo, locale: "it" });
    }

    const byKey = await cells("stay_profile");

    expect(byKey.get("resident")).toMatchObject({ status: "shown", clients: 5, orders: 15 });
    expect(byKey.get("seasonal")).toEqual({
      status: "too_few_clients",
      key: "seasonal",
      label: "Saisonnier (estimé)",
    });
  });
});
