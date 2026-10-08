/**
 * `@lfd/front-ops` — **ce que les fronts renvoient d'eux-mêmes.**
 *
 * Trois fournisseurs Angular, et une seule idée derrière : un front est la seule
 * brique dont la santé ne s'observe pas de l'extérieur. Une sonde dit qu'il est
 * *servi* ; elle ne dit ni qu'il démarre, ni qu'il est utilisable, ni que
 * quelque chose vient de casser dans un navigateur.
 *
 * - {@link provideWebVitals} — LCP, INP, CLS renvoyés à notre API ;
 * - {@link provideSentry} — les erreurs, chez un tiers, pour les *source maps* ;
 * - {@link provideStaleBundleReload} — un onglet resté sur une version retirée
 *   se recharge une fois, au lieu de rester muet ;
 * - {@link provideNewVersionWatch} — un onglet apprend qu'une nouvelle version
 *   est en ligne et la prend à la navigation suivante ({@link NEW_VERSION}).
 *
 * **Aucune donnée personnelle ne quitte le navigateur** par ces deux chemins,
 * et c'est vérifiable ici plutôt que dans quatre applications.
 *
 * Extrait au **deuxième usage**, pas au premier : la boutique l'a porté seule le
 * temps qu'on sache ce qui se généralisait vraiment. Ce qui a bougé à
 * l'extraction : rien — les deux fournisseurs prenaient déjà leur nœud et leur
 * adresse en paramètres.
 */
export { provideSentry } from "./sentry.js";
export { NEW_VERSION, provideNewVersionWatch } from "./new-version-watch.js";
export { NEW_VERSION_BANNER, newVersionModeOf } from "./new-version.js";
export { provideStaleBundleReload } from "./stale-bundle-reload.js";
export { provideWebVitals } from "./web-vitals.js";
