import type { LegalEntityView } from "@lfd/contracts";

/**
 * Port de **lecture pour l'écran** — ce que Comptabilité › Entités juridiques
 * affiche.
 *
 * Troisième port sur la même table, et les trois ont chacun leur raison : celui
 * d'écriture rend l'agrégat (on va le muter), {@link CreditorReader} rend une
 * copie figée à recopier sur un document, celui-ci rend une **vue**. Un seul
 * port qui ferait les trois obligerait chaque consommateur à dépendre de
 * méthodes qu'il n'appelle pas — et surtout, il laisserait la facturation
 * recevoir un agrégat qu'elle pourrait muter depuis son propre contexte.
 *
 * 🔴 **`canCollect` et `missingToCollect` de la vue viennent de l'agrégat**,
 * jamais d'un calcul refait dans l'adaptateur. Les recalculer ici serait une
 * seconde définition de « complète » à tenir d'accord avec la première pour
 * toujours — et celle qui dériverait est celle que l'écran montre.
 */
export abstract class LegalEntityReader {
  /** Toutes les entités, les vivantes d'abord, puis les archivées. */
  abstract list(): Promise<readonly LegalEntityView[]>;

  /** Une entité par son id, ou `null`. */
  abstract byId(id: string): Promise<LegalEntityView | null>;
}
