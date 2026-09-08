import type { CompanyMercuriale } from "../entities/company-mercuriale.js";

/**
 * Port de **lecture** de la mercuriale d'un client.
 *
 * Lecture seule, comme `PriceRuleReader` et pour la même raison : le chemin qui
 * facture ne doit pas pouvoir poser un tarif.
 *
 * ## Pourquoi il rend l'OBJET, et pas une règle
 *
 * Parce qu'une règle suppose une **mesure** — quel palier retenir — et qu'un
 * lecteur ne l'a pas : il charge une fois pour tout un panier, dont chaque
 * ligne porte sa propre quantité. Convertir ici rendrait le palier de la
 * première quantité pour tout le reste, et la projection y verrait une courbe
 * plate.
 *
 * C'est exactement la décision de `VolumeLadderReader`, qui rend des échelles
 * et jamais des règles : `ladderAsRule` n'est appelé par aucun lecteur.
 */
export abstract class CompanyMercurialeReader {
  /**
   * **La mercuriale qui agit chez ce client à cet instant**, ou `null`.
   *
   * Au plus une : la contrainte d'exclusion n'en laisse pas deux se recouvrir
   * chez un même client. Une mercuriale **suspendue** est rendue quand même —
   * c'est la fonction pure qui décide de ne pas l'appliquer, `applies` lisant
   * `suspendedFrom`. Un lecteur qui la filtrerait dupliquerait cette décision.
   *
   * `null` sur un `companyId` absent : un visiteur sans société n'a pas de
   * tarif négocié, et le port le sait sans interroger la base.
   */
  abstract liveFor(companyId: string | null, at: Date): Promise<CompanyMercuriale | null>;
}
