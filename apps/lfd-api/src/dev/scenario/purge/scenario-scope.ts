import type { Prisma, PrismaClient } from "../../../platform/database/client/client.js";

/**
 * **Ce qui appartient au scénario de commandes** — le périmètre de la remise à
 * l'état de base (`documentation/order/plan-jeu-de-donnees-par-etapes.md`
 * §2 bis : « seulement ce qui appartient aux journées et aux clients du
 * scénario : jamais une table entière »).
 *
 * Deux clés, et tout le reste en dérive :
 *
 * - **les clients du scénario** — le client de référence, ses voisins, les
 *   clients de la journée de livraison. Leurs commandes, et les acheteurs qui
 *   les passent ;
 * - **les journées du scénario** — celles de ces commandes, plus les quatre
 *   que le scénario nomme (hier, aujourd'hui, demain, J+2), même vides : une
 *   journée de fournil peut survivre à ses commandes.
 *
 * Les sous-comptes de démo (« Alpes », « Cimes ») n'y sont pas : ils ont leur
 * propre semis (`seed:sub-accounts`), plan Q1.
 */
export interface ScenarioScope {
  readonly companyIds: readonly string[];
  /** Les acheteurs — les membres des sociétés du scénario. */
  readonly userIds: readonly string[];
  readonly orderIds: readonly string[];
  /** Les numéros des mêmes commandes : certaines traces ne portent que lui. */
  readonly orderNumbers: readonly string[];
  /** `AAAA-MM-JJ`, triées. */
  readonly days: readonly string[];
}

/** Le client d'une purge : le client entier, ou celui d'une transaction. */
export type PurgeClient = Prisma.TransactionClient;

/** Délai d'une transaction de purge : une journée de démo pèse quelques centaines de lignes. */
export const PURGE_TRANSACTION_TIMEOUT_MS = 60_000;

/** Lit le périmètre en base, à partir des sociétés et des journées nommées. */
export async function resolveScenarioScope(
  prisma: PrismaClient,
  companyIds: readonly string[],
  namedDays: readonly string[],
): Promise<ScenarioScope> {
  const orders = await prisma.order.findMany({
    where: { companyId: { in: [...companyIds] } },
    select: { id: true, orderNumber: true, requestedDeliveryDate: true },
  });
  const members = await prisma.membership.findMany({
    where: { companyId: { in: [...companyIds] } },
    select: { userId: true },
  });
  const orderDays = orders.flatMap((order) =>
    // Une colonne `@db.Date` revient à minuit UTC : sa date UTC EST le jour.
    order.requestedDeliveryDate === null
      ? []
      : [order.requestedDeliveryDate.toISOString().slice(0, 10)],
  );
  return {
    companyIds: [...companyIds],
    userIds: [...new Set(members.map((member) => member.userId))],
    orderIds: orders.map((order) => order.id),
    orderNumbers: orders.map((order) => order.orderNumber),
    days: [...new Set([...orderDays, ...namedDays])].sort(),
  };
}
