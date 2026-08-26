import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Le nom d'un emplacement est obligatoire. */
export class LocationNameRequiredError extends BusinessError {
  constructor() {
    super("locations.location.name_required", "Le nom est obligatoire.");
  }
}

/**
 * Deux emplacements ne portent pas le même nom.
 *
 * Le nom est ce que l'écran affiche pour désigner un point de vente — dans la
 * grille de canaux d'une famille, c'est la SEULE chose qui distingue une ligne
 * d'une autre. Deux « Village » y produisent deux cases identiques dont l'une
 * vend et l'autre non, et personne ne peut dire laquelle. La grille est indexée
 * par identifiant : elle, elle s'y retrouve. Pas l'humain devant.
 */
export class LocationNameTakenError extends BusinessError {
  /** Plus de `takenBy` : la base tient l'unicité, et une contrainte ne dit pas
   *  qui détient le nom. */
  constructor(override readonly name: string) {
    super("locations.location.name_taken", `Un autre emplacement porte déjà le nom « ${name} ».`);
  }
}

/** L’emplacement visé n'existe pas (→ 404). */
export class LocationNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("locations.location.not_found", `Emplacement introuvable : ${id}.`);
  }
}

/** La table visée n'existe pas dans cet emplacement (→ 404). */
export class LocationTableNotFoundError extends ResourceNotFoundError {
  constructor(locationId: string, tableNumber: number) {
    super(
      "locations.table.not_found",
      `Table ${tableNumber} introuvable dans l'emplacement ${locationId}.`,
    );
  }
}

/**
 * L’emplacement est encore coché par des familles : on refuse de le supprimer.
 *
 * **Business** et non domaine : la règle n'est pas un invariant de l'agrégat —
 * un emplacement ignore les familles — mais une protection de l'exploitation
 * contre elle-même. Elle se satisfait en décochant, donc l'appelant peut agir.
 */
export class LocationInUseError extends BusinessError {
  /**
   * Le compte est **facultatif**, et c'est le mur qui l'explique : le refus
   * vient de la clé étrangère `Restrict`, levée à l'intérieur de la
   * transaction. Une fois qu'un ordre a échoué, la transaction Postgres est
   * avortée — recompter là pour enrichir le message échouerait à son tour, et
   * le refus métier deviendrait une erreur technique.
   *
   * L'écran, lui, affiche déjà le compte à côté de chaque ligne : ce message
   * n'a qu'à dire quoi faire.
   */
  constructor(id: string, categories?: number) {
    super(
      "locations.location.in_use",
      `Emplacement encore vendeur : ${describeHolders(categories)} le citent dans leurs canaux. ` +
        `Décochez-le avant de le supprimer (${id}).`,
    );
  }
}

function describeHolders(categories: number | undefined): string {
  return categories === undefined ? "des familles" : `${String(categories)} famille(s)`;
}
