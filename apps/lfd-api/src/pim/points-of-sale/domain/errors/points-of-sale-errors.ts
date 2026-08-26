import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Le libellé d'un point de vente est obligatoire. */
export class PointOfSaleLabelRequiredError extends BusinessError {
  constructor() {
    super("points_of_sale.point_of_sale.label_required", "Le nom est obligatoire.");
  }
}

/**
 * Deux points de vente ne portent pas le même nom.
 *
 * Le libellé est ce que l'écran affiche pour désigner un point de vente — dans
 * la matrice de canaux d'une famille, c'est la SEULE chose qui distingue une
 * ligne d'une autre. Deux « Village » y produisent deux lignes identiques dont
 * l'une vend et l'autre non, et personne ne peut dire laquelle. La matrice est
 * indexée par identifiant : elle, elle s'y retrouve. Pas l'humain devant.
 */
export class PointOfSaleLabelTakenError extends BusinessError {
  constructor(readonly label: string) {
    super(
      "points_of_sale.point_of_sale.label_taken",
      `Un autre point de vente porte déjà le nom « ${label} ».`,
    );
  }
}

/** Le point de vente visé n'existe pas (→ 404). */
export class PointOfSaleNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("points_of_sale.point_of_sale.not_found", `Point de vente introuvable : ${id}.`);
  }
}

/** La table visée n'existe pas dans ce point de vente (→ 404). */
export class PointOfSaleTableNotFoundError extends ResourceNotFoundError {
  constructor(pointOfSaleId: string, tableNumber: number) {
    super(
      "points_of_sale.table.not_found",
      `Table ${tableNumber} introuvable dans le point de vente ${pointOfSaleId}.`,
    );
  }
}

/**
 * Le point de vente est encore vendu par des familles : on refuse de le
 * supprimer.
 *
 * **Business** et non domaine : la règle n'est pas un invariant de l'agrégat —
 * un point de vente ignore les familles — mais une protection de l'exploitation
 * contre elle-même. Elle se satisfait en décochant, donc l'appelant peut agir.
 */
export class PointOfSaleInUseError extends BusinessError {
  /**
   * Le compte est **facultatif**, et c'est le mur qui l'explique : le refus
   * vient de la clé étrangère `Restrict`, levée à l'intérieur de la
   * transaction. Une fois qu'un ordre a échoué, la transaction Postgres est
   * avortée — recompter là pour enrichir le message échouerait à son tour, et
   * le refus métier deviendrait une erreur technique.
   */
  constructor(id: string, categories?: number) {
    super(
      "points_of_sale.point_of_sale.in_use",
      `Point de vente encore vendeur : ${describeHolders(categories)} le citent dans leurs ` +
        `canaux — familles ou dérogations de fiches. Décochez-le avant de le supprimer (${id}).`,
    );
  }
}

/**
 * On ne cesse pas d'offrir un contexte qu'on y vend encore.
 *
 * Sans ce refus, la ligne de matrice survivait à l'offre : la famille
 * continuait de vendre « sur place » depuis une boutique qui ne sert plus, la
 * projection fabriquait une fiche pour un lieu qui ne l'honore pas — et l'écran
 * ne rendait même plus la case, donc plus personne ne pouvait la décocher. Le
 * point de vente devenait insupprimable, avec un message qui parlait de
 * familles qu'on ne voyait nulle part.
 */
export class ContextStillSoldHereError extends BusinessError {
  constructor(contextKey: string, sellers: number) {
    super(
      "points_of_sale.point_of_sale.context_still_sold",
      `« ${contextKey} » est encore vendu ici par ${String(sellers)} famille(s) ou fiche(s). ` +
        `Décochez-le de leurs canaux avant de cesser de l'offrir.`,
    );
  }
}

/**
 * Une **plateforme** n'a ni URL de click & collect ni grille de tables.
 *
 * C'est le genre qui l'interdit, pas une convention de lecture : la base porte
 * la même règle (`point_of_sale_shop_has_base_url`), et une plateforme équipée
 * de QR serait un meuble dans un site web.
 */
export class PlatformHasNoEquipmentError extends BusinessError {
  constructor(what: string) {
    super(
      "points_of_sale.point_of_sale.platform_has_no_equipment",
      `Une plateforme n'a pas ${what} — c'est un équipement de boutique.`,
    );
  }
}

/**
 * La plateforme racine ne se supprime pas.
 *
 * Même contrat, et même raison, que le contexte de vente racine : sans elle, la
 * matrice B2B n'a plus de cible et la boutique professionnelle **se vide sans
 * qu'une erreur soit levée**.
 */
export class RootPointOfSaleProtectedError extends BusinessError {
  constructor() {
    super(
      "points_of_sale.point_of_sale.root_protected",
      "La plateforme professionnelle ne peut pas être supprimée.",
    );
  }
}

function describeHolders(categories: number | undefined): string {
  return categories === undefined ? "des familles" : `${String(categories)} famille(s)`;
}
