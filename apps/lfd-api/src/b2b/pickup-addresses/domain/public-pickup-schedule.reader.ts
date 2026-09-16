import type { PublicPickupScheduleView } from "@lfd/contracts";

/**
 * Port de **lecture** de l'horaire public d'un point — règles et fermetures,
 * avec leurs identifiants.
 *
 * Une interface distincte du port d'écriture, et non deux méthodes de plus sur
 * lui (ISP, `CLAUDE.md` §2) : l'écran de réglages relit ce qu'il vient
 * d'enregistrer, et le lot suivant y branchera l'accueil public — ni l'un ni
 * l'autre n'a besoin de pouvoir réécrire une grille.
 *
 * Elle rend la **vue** du contrat, pas l'agrégat : une lecture n'a aucun
 * invariant à tenir.
 */
export abstract class PublicPickupScheduleReader {
  /**
   * L'horaire public d'un point. Un point non réglé rend deux listes **vides** —
   * l'état de tous les points avant ce chantier, et celui qui laisse le
   * comportement d'aujourd'hui intact (D6).
   */
  abstract read(pickupAddressId: string): Promise<PublicPickupScheduleView>;
}
