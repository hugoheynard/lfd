import type { PlaceOrderPayload } from "@lfd/contracts";

import { PlaceOrderCommand } from "../../src/orders/application/commands/place-order.command.js";
import { CATALOG_SEED } from "../../src/orders/infrastructure/product-catalog.seed.js";
import { customer, type SeedHarness } from "./harness.js";
import { persona } from "./personas.js";

/**
 * Phase **orders** : passe des commandes **zéro-friction** (companyId null) pour un
 * sous-ensemble de personnes → prospects **hot** avec un **momentum** varié. Les
 * dates sont backdatées (via `runAt`) selon un profil dérivé de l'index, pour que
 * les 4 trajectoires (accélère / stable / refroidit / dormant) soient toutes
 * représentées dans le corpus.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Passe des commandes pour ~2/3 des personnes ; rend le nombre de commandes créées. */
export async function seedOrders(
  harness: SeedHarness,
  userCount: number,
  anchor: Date,
): Promise<number> {
  let created = 0;
  for (let i = 0; i < userCount; i += 1) {
    if (i % 3 === 2) {
      continue; // ~1/3 restent **mid** (inscrits sans commande).
    }
    const who = persona(i);
    const user = await harness.prisma.user.findUnique({ where: { auth0Sub: who.authSub } });
    if (user === null) {
      continue;
    }
    const already = await harness.prisma.order.count({ where: { placedByUserId: user.id } });
    if (already > 0) {
      continue; // idempotent : cette personne a déjà des commandes.
    }
    for (const at of orderDates(i, anchor)) {
      await placeOne(harness, user.id, i, at);
      created += 1;
    }
  }
  return created;
}

/** Une commande d'un article du catalogue, à l'instant `at`. */
async function placeOne(harness: SeedHarness, userId: string, i: number, at: Date): Promise<void> {
  const sku = CATALOG_SEED[(i * 7) % CATALOG_SEED.length]?.sku ?? CATALOG_SEED[0].sku;
  const payload: PlaceOrderPayload = {
    companyId: null,
    fulfillmentMethod: "pickup",
    deliveryZoneId: null,
    deliveryAddress: null,
    pickupAddressId: null,
    requestedDeliveryDate: null,
    note: "",
    lines: [{ sku, quantity: 1 + (i % 5) }],
  };
  await harness.runAt(at, customer(userId), () =>
    harness.commands.execute<PlaceOrderCommand, unknown>(new PlaceOrderCommand(userId, payload)),
  );
}

/**
 * Dates de commande d'une personne, calibrées pour couvrir les 4 momentums
 * (fenêtres glissantes de 14 j du moteur). `i % 4` choisit le profil.
 */
function orderDates(i: number, anchor: Date): Date[] {
  const days = MOMENTUM_PROFILES[i % MOMENTUM_PROFILES.length];
  return days.map((d) => new Date(anchor.getTime() - d * DAY_MS));
}

/** Jours-avant-`anchor` par profil : accélère / stable / refroidit / dormant. */
const MOMENTUM_PROFILES: readonly number[][] = [
  [2, 6, 10, 20], // accélère : 3 récents (≤14j) vs 1 antérieur
  [4, 10, 18, 24], // stable : 2 vs 2
  [16, 20, 24, 6], // refroidit : 1 récent vs 3 antérieurs
  [40, 55], // dormant : rien de récent
];
