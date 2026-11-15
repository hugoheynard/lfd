/**
 * La porte du plan (`plan/`) : ce que les autres métiers du fournil lisent du
 * prod manager — prévisionnel, arrêt, réouverture, retirage, clôture, tranches,
 * dossier du jour. Tout le reste de `plan/` est privé (plan
 * `documentation/fournil/plan-decoupage-du-fournil.md`, § 1 bis ; porte
 * `lint:production-subcontexts`).
 *
 * On ne rend public que ce que les autres utilisent réellement, et aucun autre
 * métier du fournil n'a le droit de lire le plan (vérifié le 2026-11-15) : les
 * deux lecteurs de l'atelier (la fiche PDF et son exemplaire) sont des arêtes
 * hors du schéma, comptées en dette, qu'une porte ne rendrait pas légitimes.
 * Les canaux que le plan implémente sont reliés par les racines de composition
 * (`production.module.ts`, `appBootstrap/`), qui importent les adaptateurs en
 * direct. La porte n'exporte que les commandes qu'un client du bus envoie
 * (le semis de `dev/`), et un besoin neuf s'y ajoute ici.
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporterait ne doit
 * charger un autre métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées.
 */
export { CloseProductionDayCommand } from "./application/commands/close-production-day.command.js";
