/**
 * La porte du réassort (`resupply/`) : ce que les autres métiers du fournil
 * lisent du lancement des réassorts. Tout le reste de `resupply/` est privé
 * (plan `documentation/fournil/plan-decoupage-du-fournil.md`, § 1 bis ; porte
 * `lint:production-subcontexts`).
 *
 * On ne rend public que ce que les autres utilisent réellement, et aucun autre
 * métier du fournil ne lit le réassort (vérifié le 2026-11-15) : les canaux
 * qu'il implémente sont reliés par les racines de composition
 * (`production.module.ts`, `appBootstrap/`), qui importent les adaptateurs en
 * direct. La porte est donc vide, et un besoin neuf s'y ajoute ici.
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporterait ne doit
 * charger un autre métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées.
 */
export {};
