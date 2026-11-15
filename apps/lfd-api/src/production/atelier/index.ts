/**
 * La porte de l'atelier (`atelier/`) : ce que les autres métiers du fournil
 * lisent de l'atelier — fournées, fiche, affichage, raccourcis, contenants.
 * Tout le reste d'`atelier/` est privé (plan
 * `documentation/fournil/plan-decoupage-du-fournil.md`, § 1 bis ; porte
 * `lint:production-subcontexts`).
 *
 * On ne rend public que ce que les autres utilisent réellement, et aucun autre
 * métier du fournil n'a le droit de lire l'atelier (vérifié le 2026-11-15) :
 * les lecteurs du plan (le rendu des papiers, le prévisionnel, les réglages,
 * l'exemplaire du compte) qui lisent la mise en page de la fiche et le
 * rangement de l'affichage sont des arêtes hors du schéma, comptées en dette,
 * qu'une porte ne rendrait pas légitimes. Les contrôleurs, les adaptateurs et
 * le module des raccourcis sont reliés par les racines de composition
 * (`production.module.ts`, `appBootstrap/`), qui les importent en direct. La
 * porte n'exporte que les commandes qu'un client du bus envoie (le semis de
 * `dev/`), et un besoin neuf s'y ajoute ici.
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporterait ne doit
 * charger un autre métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées.
 */
export { CancelBatchCommand } from "./application/commands/cancel-batch.command.js";
export { RecordBatchCommand } from "./application/commands/record-batch.command.js";
