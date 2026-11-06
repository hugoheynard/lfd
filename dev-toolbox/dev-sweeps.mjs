/**
 * **Les tâches périodiques de la production, rejouées sur le poste de dev.**
 *
 * En production, un Worker Cloudflare appelle toutes les cinq minutes (et à
 * l'heure) des routes machine de l'API (`apps/lfd-api/container/worker.ts`) :
 * l'arrêt du plan, la boîte d'envoi, l'expiration des commandes impayées… En
 * local, rien ne les jouait. Le 2026-11-02 au matin, le prévisionnel de dev
 * criait « le plan d'aujourd'hui n'a pas été arrêté hier soir » : personne ne
 * l'avait arrêté, parce que l'arrêt automatique n'existe qu'en production.
 *
 * `api-dev.mjs` appelle ces routes au même rythme, avec un jeton qu'il passe à
 * l'API au démarrage. Ce fichier ne porte que la DÉCISION : quelles routes, à
 * quel rythme, et lesquelles on ne rejoue pas — chacune avec sa raison.
 *
 * Tests : `node --test dev-toolbox/__tests__/dev-sweeps.test.mjs`.
 */

/** Toutes les cinq minutes, comme le cron `*\/5` du Worker (`refreshSweeps`). */
export const EVERY_FIVE_MINUTES = [
  "admin/outbox/sweep",
  "admin/production/auto-close",
  "admin/delivery/off-round/sweep",
  "admin/orders/unsettled-shop-orders/expire",
  "admin/orders/refunds/sweep",
  "admin/vitrine/sweep",
  // Le balayeur des e-mails (S1b) : reprend les envois restés en route.
  "admin/mail/requests/sweep",
];

/** À chaque heure pile, comme le cron `0 *` du Worker (`hourlySweeps`). */
export const EVERY_HOUR = ["admin/orders/settlement-reminders", "admin/delivery-notes/sweep"];

/**
 * Ce que le Worker appelle et que le poste de dev ne rejoue PAS. Une route
 * ajoutée au Worker sans être rangée ici ni plus haut est signalée au
 * démarrage de l'API de dev (`unclassifiedWorkerPaths`).
 */
export const NOT_IN_DEV = new Map([
  ["admin/recompute", "le recalcul de la croissance : lourd, et rien du parcours n'en dépend"],
  [
    "admin/media/sweep",
    "ramasse les visuels orphelins : effacerait une image déposée en cours d'essai",
  ],
  ["admin/loyalty/sweep", "la nuit de la fidélité : fait expirer des points"],
  ["admin/production/quality/sweep", "purge des photos de contrôle"],
  ["admin/delivery/journal/sweep", "purge du journal de livraison"],
  ["admin/delivery/geocoding/sweep", "purge du géocodage"],
  ["admin/delivery/positions/sweep", "purge des positions des livreurs"],
  ["admin/contact/messages/anonymization/sweep", "anonymise les demandes clients"],
  [
    "admin/accounting/collection/autopilot",
    "constitue les lots de prélèvement : à jouer à la main quand on l'éprouve",
  ],
  ["admin/outbox/purge", "purge de la boîte d'envoi (à blanc par défaut) : rien à éprouver en dev"],
  [
    "admin/mail/requests/purge",
    "purge du suivi des e-mails (à blanc par défaut) : rien à éprouver en dev",
  ],
  [
    "admin/accounting/monthly-invoices/autopilot",
    "émet les factures du mois : à jouer à la main quand on l'éprouve",
  ],
]);

export const FIVE_MINUTES_MS = 5 * 60_000;
export const HOUR_MS = 60 * 60_000;

/**
 * Les routes dues à `now`, sachant la dernière passe de chaque rythme
 * (`null` : jamais). Les cinq minutes partent dès la première passe ; l'heure
 * part au premier changement d'heure, comme `0 *` — pas au démarrage, qui
 * relancerait les rappels de règlement à chaque relance de l'API.
 */
export function dueSweeps(now, last) {
  const due = [];
  if (last.fiveMinutes === null || now - last.fiveMinutes >= FIVE_MINUTES_MS) {
    due.push("fiveMinutes");
  }
  const thisHour = Math.floor(now / HOUR_MS);
  if (last.hour !== null && thisHour > Math.floor(last.hour / HOUR_MS)) {
    due.push("hour");
  }
  return due;
}

/** Les routes machine nommées dans le source du Worker. */
export function workerPaths(source) {
  return [...source.matchAll(/["'](admin\/[\w/-]+)["']/gu)].map((match) => match[1]);
}

/** Celles qu'aucune des trois listes ne range. */
export function unclassifiedWorkerPaths(source) {
  const known = new Set([...EVERY_FIVE_MINUTES, ...EVERY_HOUR, ...NOT_IN_DEV.keys()]);
  return [...new Set(workerPaths(source))].filter((path) => !known.has(path));
}
