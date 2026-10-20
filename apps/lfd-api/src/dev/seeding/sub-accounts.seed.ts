import type { ClientContext } from "./client.seed.js";
import { atHour, type SeedContext, shiftDays } from "./order-placing.seed.js";
import { seedAlpesChalets } from "./sub-account-chalets.seed.js";
import { seedHotelGroup } from "./sub-account-hotels.seed.js";
import { ALPES, seedSubAccountOrders } from "./sub-account-orders.seed.js";
import { seedSubAccountPricing, startOfPreviousMonth } from "./sub-account-pricing.seed.js";

/**
 * **Les sous-comptes, en démonstration** (`sous-comptes.md`, §2.1 et §4) :
 * le gestionnaire de chalets et ses trois sites, le groupe hôtelier et ses
 * deux établissements, leurs tarifs négociés et deux mois de commandes.
 *
 * Tout passe par les gestes réels ; relancer réaligne et ne double rien.
 *
 * 🔴 **La structure est posée la veille du mois dernier**, pas aujourd'hui :
 * un suivi est une période datée (§2.1), et la passation comme la mesure du
 * volume le lisent À LA DATE de la commande. Des suivis ouverts le jour du
 * semis laissaient les commandes du mois dernier hors mercuriale et hors
 * cumul (constaté au premier passage, 2026-10-05).
 */
export interface SubAccountsReport {
  readonly chalets: number;
  readonly hotels: number;
  readonly removed: number;
  readonly placed: number;
}

/** L'heure des gestes de structure, la veille du mois dernier. */
const STRUCTURE_HOUR = 9;

/**
 * **La structure seule** — les deux principaux et leurs sites, sans tarif ni
 * commande : ce que `db:seed` pose sur une base neuve, où le catalogue n'est
 * pas encore là (le tarif et les commandes nomment des SKU). Additif, comme
 * lui ; relancé, il ne double rien.
 */
export async function seedSubAccountStructure(context: ClientContext): Promise<void> {
  const from = startOfPreviousMonth(context.now);
  const structure = { ...context, now: atHour(shiftDays(from, -1), STRUCTURE_HOUR) };
  await seedAlpesChalets(structure);
  await seedHotelGroup(structure);
}

export async function seedSubAccounts(context: SeedContext): Promise<SubAccountsReport> {
  const from = startOfPreviousMonth(context.now);
  const structure = { ...context, now: atHour(shiftDays(from, -1), STRUCTURE_HOUR) };
  const alpes = await seedAlpesChalets(structure);
  const cimes = await seedHotelGroup(structure);
  await seedSubAccountPricing(structure, from, {
    groupId: cimes.groupId,
    hotelIds: [...cimes.hotels.values()],
  });
  const orders = await seedSubAccountOrders(
    context,
    new Map([[ALPES, alpes.principalId], ...alpes.chalets, ...cimes.hotels]),
  );
  return {
    chalets: alpes.chalets.size,
    hotels: cimes.hotels.size,
    removed: orders.removed,
    placed: orders.placed,
  };
}
