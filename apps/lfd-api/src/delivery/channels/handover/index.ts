/**
 * **Le canal que la livraison publie POUR le retrait** (2026-10-01,
 * `plan-a-la-porte.md`, BQ) : des classes abstraites qu'il implémente.
 *
 * | Pièce                     | La question / l'annonce                     |
 * | ------------------------- | ------------------------------------------- |
 * | `DepartureHoldsReader`    | « lesquelles sont retenues ? », au départ   |
 * | `DepartedOrdersAnnouncer` | « elles sont parties », après la validation |
 *
 * `lint:context-boundaries` n'autorise `handover → delivery` que par ce
 * chemin ; `delivery → handover` reste interdit.
 */
export { DepartureHoldsReader } from "./departure-holds.reader.js";
export { DepartedOrdersAnnouncer } from "./departed-orders.announcer.js";
