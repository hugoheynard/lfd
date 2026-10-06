import type { ClientContext } from "./client.seed.js";
import { fictiveRegistration } from "./fictive-registration.js";
import { type NeighbourClient, seedFictiveClients } from "./neighbour-clients.seed.js";
import { TOMORROW_HOUSES, type TomorrowHouse } from "./tomorrow-rounds-houses.js";

/**
 * **Les maisons des tournées de demain** (Hugo, 2026-10-06 : « un bel exemple
 * de tournées qui nécessiteraient 3 camionnettes »).
 *
 * Trois secteurs autour du Labo (Val d'Isère) : Val d'Isère même, Tignes, et
 * Bourg-Saint-Maurice avec les Arcs et Séez. Sept maisons par secteur, dont
 * une ou deux à échéance serrée (6 h – 7 h).
 *
 * Semées par le MÊME chemin que les voisins (`seedFictiveClients`) :
 * déclaration, facturation, adresse de livraison avec son point GPS et son
 * échéance, terme mensuel, activation par la porte. Les noms sont inventés ;
 * les points sont posés à la main sur les rues des stations (approchés, pas
 * relevés), les `auth0Sub` fictifs (`seed|…`), les adresses en `.test`.
 *
 * ⚠️ Un rang dans cette liste fixe le SIRET (`fictiveRegistration`) : on
 * ajoute en fin de liste, on n'insère pas — sans quoi une maison déjà semée
 * changerait d'immatriculation au prochain semis d'une base vierge, et la
 * suivante buterait sur un SIRET déjà pris.
 */

/** La ligne, devenue un client fictif comme les autres. */
function clientOf(row: TomorrowHouse, rank: number): NeighbourClient {
  const [firstName, lastName, phone] = row.contact;
  return {
    raisonSociale: `${row.forme} ${row.enseigne}`,
    enseigne: row.enseigne,
    formeJuridique: row.forme,
    ...fictiveRegistration(rank),
    person: {
      auth0Sub: `seed|${row.slug}`,
      email: `commandes@${row.slug}.test`,
      firstName,
      lastName,
      phone,
    },
    address: { ligne1: row.ligne1, codePostal: row.codePostal, ville: row.ville },
    gps: { lat: row.lat, lng: row.lng },
    site: {
      deadlines: [row.deadline],
      note: "",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  };
}

export const TOMORROW_ROUNDS_CLIENTS: readonly NeighbourClient[] = TOMORROW_HOUSES.map(clientOf);

/** Idempotent par raison sociale, comme les voisins. */
export async function seedTomorrowRoundsClients(context: ClientContext): Promise<void> {
  await seedFictiveClients(context, TOMORROW_ROUNDS_CLIENTS);
}
