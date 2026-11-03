import type { ShortfallReportedLine } from "./packing-shortfall-reported.event.js";

/**
 * **Figer le bac sans publier** — le geste du colisage qu'appelle le départ
 * incomplet décidé au comptoir (plan
 * `documentation/comptoir/depart-incomplet.md`, §4.2,
 * étape 3 — Hugo, 2026-11-03).
 *
 * Déclaré ET implémenté par le colisage, appelé par le commerce DANS la
 * transaction de sa décision, après le verrou de la commande (« commande,
 * puis fiche »), comme `ShortfallDesk`. À part de lui (ISP) : la décision
 * des managers n'en a pas besoin.
 *
 * `freeze` verrouille la fiche la plus récente de l'envoi, lit les quantités
 * au bac et pose la marque « manque » — la même règle que « Il manque » au
 * poste (`PackingSheet.reportShortfall`), SANS publier
 * `packing.shortfall_reported` : le client est au comptoir, le commerce écrit
 * lui-même le signal, dans la même transaction. Un fait asynchrone le ferait
 * attendre (piste B écartée).
 *
 * Refus nommés (409), ceux du signal : pas tiré au colisage, bac fermé,
 * comptage par contenants, rien ne manque, départ déjà décidé.
 */
export abstract class ShortfallFreezeDesk {
  abstract freeze(orderId: string, rank: number): Promise<readonly ShortfallReportedLine[]>;
}
