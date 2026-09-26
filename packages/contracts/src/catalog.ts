/**
 * Le **catalogue**, tel qu'un écran le parcourt.
 *
 * Il existait déjà trois copies de la même table de produits — le PIM, le seed
 * du front client (avec visuels et descriptions), et le seed du backend (avec
 * les prix qui font foi au checkout). Une quatrième pour le back-office aurait
 * été la copie de trop : celle où le commercial annonce au téléphone un prix que
 * le serveur refusera ensuite.
 *
 * D'où ce contrat : le back-office lit le catalogue **du serveur**, celui-là
 * même qui ré-résout les prix à la passation. Ce qu'il affiche est donc, par
 * construction, ce qui sera facturé.
 */

/**
 * **Une famille du référentiel**, telle qu'un écran la range.
 *
 * L'`id` est celui du PIM, reçu par le miroir `catalog_categories` ; `name` et
 * `position` aussi. Il n'y a plus de liste des rayons dans le code (plan
 * `documentation/pricing/plan-familles-en-donnees.md`) : une famille livrée par
 * le référentiel EST un rayon, sans déploiement. L'union fermée qui la
 * remplaçait a mis tout le catalogue pro en 500 le 2026-09-26, le jour où le
 * PIM a rangé un article dans une famille qu'elle ne connaissait pas.
 */
export interface CatalogFamilyView {
  readonly id: string;
  readonly name: string;
  /** L'ordre du référentiel — celui dans lequel les rayons se parcourent. */
  readonly position: number;
}

/**
 * Un article du catalogue. Prix unitaire **HT** en **millicentimes** et taux de
 * TVA du **produit** — les deux nombres dont une ligne de panier a besoin pour
 * s'afficher juste avant d'être envoyée.
 *
 * ⚠️ Ce commentaire disait « en centimes » jusqu'au 2026-09-06, vestige de la
 * bascule d'unité. C'est celui qu'on lit en écrivant le consommateur, et un
 * panier l'a cru : il sommait ce champ et affichait le total mille fois trop
 * grand. Un montant se dérive de ce prix par `lineTotalCents`, jamais par une
 * multiplication écrite à la main.
 */
export interface CatalogItemView {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceMillicents: number;
  /** Taux de TVA en %, ex. 5.5 (alimentaire) ou 20 (non-alimentaire). */
  readonly vatRate: number;
  /**
   * Sa famille, lue dans le miroir du référentiel. `null` = article reçu sans
   * famille connue (une livraison incomplète) : il reste commandable et tarifé,
   * sans décision de famille. Jamais une famille par défaut.
   */
  readonly family: CatalogFamilyView | null;
  /**
   * @deprecated remplacé par {@link family} le 2026-09-26. Servi **toujours à
   * `null`**, et pas retiré : le front déjà déployé range un `null` sous « Sans
   * famille connue », mais PERD un article dont le champ est absent. Il se
   * retire dans une livraison suivante, quand plus aucun front ne le lit.
   */
  readonly category: null;
}
