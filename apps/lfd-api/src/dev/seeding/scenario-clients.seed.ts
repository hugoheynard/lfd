import { CLIENT_ENSEIGNE } from "./client.seed.js";
import { DELIVERY_CLIENTS, seedDeliveryClients } from "./delivery-clients.seed.js";
import { NEIGHBOURS, seedNeighbourClients } from "./neighbour-clients.seed.js";
import { resolveTarget, type SeedContext, type Target } from "./order-placing.seed.js";
import {
  seedTomorrowRoundsClients,
  TOMORROW_ROUNDS_CLIENTS,
} from "./tomorrow-rounds-clients.seed.js";

/** Les clients du scénario, résolus — de quoi poser et de quoi purger. */
export interface ScenarioClients {
  /** Le client de référence puis les voisins : les rangs de la file du comptoir. */
  readonly counter: readonly Target[];
  readonly byEnseigne: ReadonlyMap<string, Target>;
  readonly companyIds: readonly string[];
}

/**
 * Les voisins et les clients de la journée de livraison — semés ici,
 * idempotents, pour que la ligne de commande `seed:orders` suffise sans
 * rejouer tout le semis.
 */
export async function prepareClients(context: SeedContext): Promise<ScenarioClients> {
  const target = await resolveTarget(context);
  await seedNeighbourClients(context);
  await seedDeliveryClients(context);
  await seedTomorrowRoundsClients(context);
  const neighbours = await Promise.all(
    NEIGHBOURS.map((neighbour) => resolveTarget(context, neighbour.raisonSociale)),
  );
  const deliveryClients = await Promise.all(
    DELIVERY_CLIENTS.map((client) => resolveTarget(context, client.raisonSociale)),
  );
  const tomorrowHouses = await Promise.all(
    TOMORROW_ROUNDS_CLIENTS.map((client) => resolveTarget(context, client.raisonSociale)),
  );
  const byEnseigne = new Map<string, Target>(
    [
      [CLIENT_ENSEIGNE, target],
      ...NEIGHBOURS.map((neighbour, rank) => [neighbour.enseigne, neighbours[rank]] as const),
      ...DELIVERY_CLIENTS.map((client, rank) => [client.enseigne, deliveryClients[rank]] as const),
      ...TOMORROW_ROUNDS_CLIENTS.map(
        (client, rank) => [client.enseigne, tomorrowHouses[rank]] as const,
      ),
    ].filter((entry): entry is readonly [string, Target] => entry[1] !== undefined),
  );
  const counter = [target, ...neighbours];
  return {
    counter,
    byEnseigne,
    companyIds: [...counter, ...deliveryClients, ...tomorrowHouses].map(
      (client) => client.companyId,
    ),
  };
}
