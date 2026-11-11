import { PICKUP_WINDOW } from "../../src/dev/seeding/counter-day.seed.js";
import {
  isoDay,
  place,
  shiftDays,
  type SeedContext,
  type Target,
} from "../../src/dev/seeding/order-placing.seed.js";
import type { SeedHarness } from "./harness.js";
import { persona } from "./personas.js";

/**
 * Phase **orders** : passe des commandes **personnelles** (sans société) pour un
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
  const context: SeedContext = {
    prisma: harness.prisma,
    commands: harness.commands,
    now: anchor,
    settle: () => harness.settle(),
  };
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
      await placeOne(harness, context, user.id, i, at);
      created += 1;
    }
  }
  return created;
}

/** Les références produit que le semis de démonstration commande déjà (`order-lines.seed.ts`). */
const SKUS = ["VIE-001", "VIE-002", "PAI-001", "VIE-009"] as const;

/**
 * Une commande d'un article, à l'instant `at`, retirée le lendemain au premier
 * point de retrait — par le geste du semis de démonstration (`place`), qui
 * porte ce qu'une passation exige : CGV, créneau, total vu, clé d'idempotence.
 */
async function placeOne(
  harness: SeedHarness,
  context: SeedContext,
  userId: string,
  i: number,
  at: Date,
): Promise<void> {
  const target = await personalTarget(harness, userId);
  await place(context, target, {
    at,
    forDay: isoDay(shiftDays(at, 1)),
    method: "pickup",
    point: null,
    window: PICKUP_WINDOW,
    lines: [{ sku: SKUS[(i * 7) % SKUS.length] ?? SKUS[0], quantity: 1 + (i % 5) }],
    paid: false,
  });
}

/** Une personne qui commande pour elle-même : ni société, ni carnet. */
async function personalTarget(harness: SeedHarness, userId: string): Promise<Target> {
  const labo = await harness.prisma.site.findFirst({
    where: { archivedAt: null, pickup: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (labo === null) {
    throw new Error("Aucun point de retrait : semer la station avant seed:growth.");
  }
  return {
    companyId: null,
    buyerUserId: userId,
    pickupAddressId: labo.id,
    pickupIds: new Map(),
    defaultDelivery: null,
    deliveries: new Map(),
  };
}

/**
 * Dates de commande d'une personne, calibrées pour couvrir les 4 momentums
 * (fenêtres glissantes de 14 j du moteur). `i % 4` choisit le profil.
 */
function orderDates(i: number, anchor: Date): Date[] {
  const days = MOMENTUM_PROFILES[i % MOMENTUM_PROFILES.length] ?? [];
  return days.map((d) => new Date(anchor.getTime() - d * DAY_MS));
}

/** Jours-avant-`anchor` par profil : accélère / stable / refroidit / dormant. */
const MOMENTUM_PROFILES: readonly number[][] = [
  [2, 6, 10, 20], // accélère : 3 récents (≤14j) vs 1 antérieur
  [4, 10, 18, 24], // stable : 2 vs 2
  [16, 20, 24, 6], // refroidit : 1 récent vs 3 antérieurs
  [40, 55], // dormant : rien de récent
];
