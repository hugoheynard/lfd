/**
 * **Le canal entre la production et le retrait — trois pièces, deux sens.**
 *
 * | Pièce                     | Déclarée par | Implémentée par | La question                              |
 * | ------------------------- | ------------ | --------------- | ---------------------------------------- |
 * | `AttestedHandoversReader` | la production | le retrait      | « qu'a-t-on remis depuis la clôture ? »  |
 * | `QualityHoldsReader`      | la production | la production   | « lesquelles sont retenues au contrôle ? » |
 * | `AtelierSheetsReader`     | la production | la production   | « lesquelles n'ont pas de feuille ? »    |
 * | `OrderCustodyReader`      | la production | le retrait      | « lesquelles ne sont plus là ? »         |
 *
 * La première est un port que le fournil DÉCLARE pour ce dont il a besoin, et
 * que `handover/infrastructure/` implémente. La seconde est PUBLIÉE : la
 * production l'implémente elle-même (`production/infrastructure/`), et le
 * retrait la lit — la figure de `pim/channels/b2b-platform/`. Les deux sont
 * reliées dans `appBootstrap/handover-feed.module.ts`. La troisième suit la
 * seconde, pour la même raison. La quatrième (2026-10-01, BQ) suit la
 * première : le retrait tient la garde, et dit au fournil ce qui est parti.
 *
 * Un seul dossier pour toutes, et c'est voulu : `lint:context-boundaries`
 * n'autorise `handover → production` que par ce chemin, et `production →
 * handover` jamais. Un dossier neuf aurait été une seconde porte.
 */
export { AttestedHandoversReader } from "./attested-handovers.reader.js";
export { AtelierSheetsReader } from "./atelier-sheets.reader.js";
export { QualityHoldsReader } from "./quality-holds.reader.js";
export { OrderCustodyReader, type OrderOutOfHand } from "./order-custody.reader.js";
