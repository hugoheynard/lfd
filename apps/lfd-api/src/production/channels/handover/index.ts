/**
 * **Le canal entre la production et le retrait — deux pièces, deux sens.**
 *
 * | Pièce                     | Déclarée par | Implémentée par | La question                              |
 * | ------------------------- | ------------ | --------------- | ---------------------------------------- |
 * | `AttestedHandoversReader` | la production | le retrait      | « qu'a-t-on remis depuis la clôture ? »  |
 * | `QualityHoldsReader`      | la production | la production   | « lesquelles sont retenues au contrôle ? » |
 *
 * La première est un port que le fournil DÉCLARE pour ce dont il a besoin, et
 * que `handover/infrastructure/` implémente. La seconde est PUBLIÉE : la
 * production l'implémente elle-même (`production/infrastructure/`), et le
 * retrait la lit — la figure de `pim/channels/b2b-platform/`. Les deux sont
 * reliées dans `appBootstrap/handover-feed.module.ts`.
 *
 * Un seul dossier pour les deux, et c'est voulu : `lint:context-boundaries`
 * n'autorise `handover → production` que par ce chemin, et `production →
 * handover` jamais. Un dossier neuf aurait été une seconde porte.
 */
export { AttestedHandoversReader } from "./attested-handovers.reader.js";
export { QualityHoldsReader } from "./quality-holds.reader.js";
