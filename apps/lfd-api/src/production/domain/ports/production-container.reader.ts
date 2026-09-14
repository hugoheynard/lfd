import type { ContainerRule } from "../services/production-worksheet.js";

/**
 * **Les contenants du four, en lecture seule.**
 *
 * Un port à part de {@link ProductionContainerRepository}, et c'est l'ISP :
 * la fiche d'atelier ne fait que LIRE le réglage — elle n'a rien à écrire, et
 * ne doit pas se voir offrir de quoi le faire. Le jour où l'écran de réglage
 * gagnera un geste, la fiche ne bougera pas.
 *
 * Une **carte par SKU** plutôt qu'une liste : la fiche cherche un contenant par
 * article, des dizaines de fois par lecture. Rendre une liste ferait écrire le
 * `find` chez l'appelant, donc deux fois, donc différemment.
 *
 * Un SKU absent de la carte n'a **pas** de contenant réglé : la colonne de la
 * fiche reste vide plutôt que d'inventer « 1 plaque ».
 */
export abstract class ProductionContainerReader {
  abstract allBySku(): Promise<ReadonlyMap<string, ContainerRule>>;
}
