import {
  DEFAULT_DELIVERY_AVAILABILITY,
  deadlinesFor,
  deliverySpecsSchema,
  resolveWindowMode,
  slotsFor,
  weekdayOfDate,
} from "@lfd/contracts";

import type { PrismaClient } from "../../platform/database/client/client.js";
import type { SeedWindow } from "./order-placing.seed.js";

/**
 * **Le créneau qu'un client CHOISIT dans son carnet**, pour le jour livré.
 *
 * Depuis le 2026-10-14 (Hugo : « pas de commande sans créneau »), la passation
 * ne reprend plus en silence la fenêtre de l'adresse : la commande doit en
 * porter une. Le semis fait donc ce que fait la boutique — il prend, dans la
 * liste que l'adresse inscrit ce jour-là et dans son mode, la première.
 *
 * Le mode se résout comme à la passation : celui de l'adresse, sinon le
 * réglage global (ligne absente = le défaut du contrat).
 *
 * @returns `null` quand l'adresse n'inscrit rien ce jour-là : le semis le dit
 *   plutôt que d'inventer une heure.
 */
export async function carnetWindowOf(
  prisma: PrismaClient,
  addressId: string,
  day: string,
): Promise<SeedWindow | null> {
  const row = await prisma.address.findUnique({
    where: { id: addressId },
    select: { deliverySpecs: true },
  });
  const specs = deliverySpecsSchema.safeParse(row?.deliverySpecs);
  if (!specs.success) {
    return null;
  }
  const settings = await prisma.deliveryAvailability.findFirst({ select: { windowMode: true } });
  const mode = resolveWindowMode(
    specs.data.windowMode,
    settings?.windowMode ?? DEFAULT_DELIVERY_AVAILABILITY.windowMode,
  );
  const weekday = weekdayOfDate(day);
  if (mode === "deadline") {
    const first = deadlinesFor(specs.data.deadlines, weekday)[0];
    return first === undefined ? null : { start: null, end: first };
  }
  const slot = slotsFor(specs.data, weekday)[0];
  return slot === undefined ? null : { start: slot.start, end: slot.end };
}
