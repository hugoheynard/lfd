import type { ClientContext } from "./client.seed.js";
import { type NeighbourClient, seedFictiveClients } from "./neighbour-clients.seed.js";

/**
 * **Les onze maisons de la journée de livraison** (Hugo, 2026-09-29).
 *
 * Les voisins de `NEIGHBOURS` suffisent au comptoir ; ils ne suffisent pas à
 * une tournée. Pour « se projeter » dans la feuille de route, l'écran des
 * tournées et le chargement, il faut une vraie journée : des arrêts dans trois
 * vallées, des créneaux qui ne se ressemblent pas, des consignes de porte, un
 * contact à appeler, une signature exigée, une procédure à étapes.
 *
 * Semées par le MÊME chemin que les voisins (`seedFictiveClients`) :
 * déclaration, facturation, adresse de livraison avec GPS et créneau, terme
 * mensuel, activation par la porte.
 *
 * Les points GPS ont été relevés sur OpenStreetMap par Hugo le 2026-09-29. Les
 * SIRET passent la clé de Luhn, et la clé TVA vaut `(12 + 3 × (SIREN mod 97))
 * mod 97` — recalculées le même jour. Les `auth0Sub` sont fictifs (`seed|…`) et
 * les adresses en `.test` : personne ne s'y connecte, personne n'y reçoit rien.
 *
 * ⚠️ Un rang dans cette liste n'est lu par personne — la journée les vise par
 * leur ENSEIGNE (`delivery-day.seed.ts`). On peut donc en ajouter sans décaler
 * quoi que ce soit, contrairement à `NEIGHBOURS`.
 */
export const DELIVERY_CLIENTS: readonly NeighbourClient[] = [
  {
    raisonSociale: "SARL Fromagerie du Parc",
    enseigne: "La Fromagerie du Parc",
    formeJuridique: "SARL",
    siret: "90112244000018",
    vatNumber: "FR30901122440",
    person: {
      auth0Sub: "seed|fromagerie-du-parc",
      email: "commandes@fromagerie-du-parc.test",
      firstName: "Claire",
      lastName: "Moret",
      phone: "06 31 42 18 77",
    },
    address: { ligne1: "Rue du Parc des Sports", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4478, lng: 6.9765 },
    site: {
      slot: { start: "07:00", end: "09:00" },
      note: "Par la cour, porte de la réserve à droite.",
      contact: { prenom: "Claire", nom: "Moret", telephone: "06 31 42 18 77" },
      signatureRequired: true,
      steps: [
        {
          title: "Entrer par la cour",
          body: "Portail gris à gauche de la boutique, jamais par la vitrine.",
        },
        {
          title: "Sonner à la réserve",
          body: "Attendre Claire ou un vendeur : la chambre froide est fermée à clé.",
        },
        { title: "Faire signer le bon", body: "Signature sur le téléphone, avant de repartir." },
      ],
    },
  },
  {
    raisonSociale: "SAS Résidence Les Balcons",
    enseigne: "Les Balcons de la Daille",
    formeJuridique: "SAS",
    siret: "90223344400014",
    vatNumber: "FR25902233444",
    person: {
      auth0Sub: "seed|balcons-daille",
      email: "reception@balcons-daille.test",
      firstName: "Julien",
      lastName: "Arpin",
      phone: "06 12 87 44 21",
    },
    address: { ligne1: "Rue du Rosoleil", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4624, lng: 6.9615 },
    site: {
      slot: { start: "06:30", end: "08:00" },
      note: "Code portail 1234, dépôt au local à skis.",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  },
  {
    raisonSociale: "SARL Chalet du Laisinant",
    enseigne: "Chalet du Laisinant",
    formeJuridique: "SARL",
    siret: "90334455400014",
    vatNumber: "FR47903344554",
    person: {
      auth0Sub: "seed|chalet-laisinant",
      email: "chalet@laisinant.test",
      firstName: "Sophie",
      lastName: "Blanc",
      phone: "06 74 20 11 39",
    },
    address: { ligne1: "Le Laisinant", codePostal: "73150", ville: "Val d'Isère" },
    gps: { lat: 45.4527, lng: 6.9905 },
    site: {
      slot: { start: "07:00", end: "09:00" },
      note: "Chemin enneigé l'hiver : se garer en bas et monter à pied.",
      contact: { prenom: "Sophie", nom: "Blanc", telephone: "06 74 20 11 39" },
      signatureRequired: false,
      steps: [],
    },
  },
  {
    raisonSociale: "SAS Hôtel des Pins",
    enseigne: "Hôtel des Pins",
    formeJuridique: "SAS",
    siret: "90445566400014",
    vatNumber: "FR69904455664",
    person: {
      auth0Sub: "seed|hotel-des-pins",
      email: "economat@hotel-des-pins.test",
      firstName: "Nicolas",
      lastName: "Gaidon",
      phone: "06 45 63 09 12",
    },
    address: {
      ligne1: "Route des Arcs, Arc 1600",
      codePostal: "73700",
      ville: "Bourg-Saint-Maurice",
    },
    gps: { lat: 45.592, lng: 6.7877 },
    site: {
      slot: { start: "06:30", end: "08:00" },
      note: "Entrée de service à l'arrière, sonner à la cuisine.",
      contact: { prenom: "Nicolas", nom: "Gaidon", telephone: "06 45 63 09 12" },
      signatureRequired: true,
      steps: [
        {
          title: "Contourner l'hôtel",
          body: "Rampe de service côté parking, pas l'entrée des clients.",
        },
        { title: "Déposer en cuisine", body: "Sacs sur la table inox, jamais au sol." },
      ],
    },
  },
  {
    raisonSociale: "SARL Le Refuge 1950",
    enseigne: "Le Refuge 1950",
    formeJuridique: "SARL",
    siret: "90556677400014",
    vatNumber: "FR91905566774",
    person: {
      auth0Sub: "seed|refuge-1950",
      email: "cuisine@refuge-1950.test",
      firstName: "Thomas",
      lastName: "Perrier",
      phone: "06 88 12 45 70",
    },
    address: {
      ligne1: "Route des Chalets de l'Arc, Arc 1950",
      codePostal: "73700",
      ville: "Bourg-Saint-Maurice",
    },
    gps: { lat: 45.5625, lng: 6.829 },
    site: {
      slot: { start: "10:00", end: "11:30" },
      note: "",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  },
  {
    raisonSociale: "SAS Brasserie des Marmottes",
    enseigne: "Brasserie des Marmottes",
    formeJuridique: "SAS",
    siret: "90667788500012",
    vatNumber: "FR19906677885",
    person: {
      auth0Sub: "seed|brasserie-marmottes",
      email: "chef@brasserie-marmottes.test",
      firstName: "Élodie",
      lastName: "Favre",
      phone: "06 23 54 76 81",
    },
    address: { ligne1: "Arc 1950", codePostal: "73700", ville: "Bourg-Saint-Maurice" },
    gps: { lat: 45.569, lng: 6.821 },
    site: {
      slot: { start: "10:00", end: "11:30" },
      note: "Livrer par la galerie marchande, porte 3.",
      contact: { prenom: "Élodie", nom: "Favre", telephone: "06 23 54 76 81" },
      signatureRequired: null,
      steps: [],
    },
  },
  {
    raisonSociale: "SARL Auberge des Contamines",
    enseigne: "Auberge des Contamines",
    formeJuridique: "SARL",
    siret: "90778899600011",
    vatNumber: "FR44907788996",
    person: {
      auth0Sub: "seed|auberge-contamines",
      email: "auberge@contamines.test",
      firstName: "Bernard",
      lastName: "Chenal",
      phone: "06 56 30 92 14",
    },
    address: { ligne1: "Rue des Contamines", codePostal: "73700", ville: "Séez" },
    gps: { lat: 45.6237, lng: 6.7962 },
    site: {
      slot: { start: "07:00", end: "09:00" },
      note: "Par la cour.",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  },
  {
    raisonSociale: "SARL Épicerie des Eulets",
    enseigne: "Épicerie des Eulets",
    formeJuridique: "SARL",
    siret: "90889900800019",
    vatNumber: "FR70908899008",
    person: {
      auth0Sub: "seed|epicerie-eulets",
      email: "bonjour@epicerie-eulets.test",
      firstName: "Martine",
      lastName: "Jacquier",
      phone: "06 67 41 28 05",
    },
    address: { ligne1: "Route de Montrigon", codePostal: "73700", ville: "Bourg-Saint-Maurice" },
    gps: { lat: 45.615, lng: 6.772 },
    // 🔴 SANS créneau, et c'est le sujet : la livraison qui n'a aucune fenêtre
    // convenue — la feuille de route et « Proposer » doivent la placer sans lui
    // en inventer une.
    site: { slot: null, note: "", contact: null, signatureRequired: null, steps: [] },
  },
  {
    raisonSociale: "SAS Le Comptoir de la Chaudanne",
    enseigne: "Le Comptoir de la Chaudanne",
    formeJuridique: "SAS",
    siret: "90990011000018",
    vatNumber: "FR62909900110",
    person: {
      auth0Sub: "seed|comptoir-chaudanne",
      email: "contact@comptoir-chaudanne.test",
      firstName: "Karim",
      lastName: "Benali",
      phone: "06 90 14 37 62",
    },
    address: { ligne1: "Rue de la Chaudanne", codePostal: "73700", ville: "Bourg-Saint-Maurice" },
    gps: { lat: 45.621, lng: 6.764 },
    site: {
      slot: { start: "06:30", end: "08:00" },
      note: "Rideau à moitié levé dès 6 h : déposer derrière le comptoir.",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  },
  {
    raisonSociale: "SARL Gîte du Villaret",
    enseigne: "Gîte du Villaret",
    formeJuridique: "SARL",
    siret: "91001122000019",
    vatNumber: "FR03910011220",
    person: {
      auth0Sub: "seed|gite-villaret",
      email: "gite@villaret.test",
      firstName: "Anne",
      lastName: "Rolland",
      phone: "06 34 78 51 26",
    },
    address: { ligne1: "Route des Hameaux", codePostal: "73700", ville: "Montvalezan" },
    gps: { lat: 45.6127, lng: 6.8457 },
    site: {
      slot: { start: "07:00", end: "09:00" },
      note: "Code portail 1234.",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  },
  {
    raisonSociale: "SARL Crêperie du Gollet",
    enseigne: "Crêperie du Gollet",
    formeJuridique: "SARL",
    siret: "91112233100018",
    vatNumber: "FR28911122331",
    person: {
      auth0Sub: "seed|creperie-gollet",
      email: "creperie@gollet.test",
      firstName: "Yann",
      lastName: "Le Goff",
      phone: "06 51 09 83 47",
    },
    address: { ligne1: "Rue du Gollet, La Rosière", codePostal: "73700", ville: "Montvalezan" },
    gps: { lat: 45.6255, lng: 6.8508 },
    site: {
      slot: { start: "10:00", end: "11:30" },
      note: "",
      contact: null,
      signatureRequired: null,
      steps: [],
    },
  },
];

/** Idempotent par raison sociale, comme les voisins. */
export async function seedDeliveryClients(context: ClientContext): Promise<void> {
  await seedFictiveClients(context, DELIVERY_CLIENTS);
}
