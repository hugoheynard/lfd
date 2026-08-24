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
 * Deux locations ne portent pas le même nom.
 *
 * Le nom est ce que l'écran affiche pour désigner un point de vente — dans la
 * grille de canaux d'une famille, c'est la SEULE chose qui distingue une ligne
 * d'une autre. Deux « Village » y produisent deux cases identiques dont l'une
 * vend et l'autre non, et personne ne peut dire laquelle. La grille est indexée
 * par identifiant : elle, elle s'y retrouve. Pas l'humain devant.
 */
export class LocationNameTakenError extends BusinessError {
  constructor(
    override readonly name: string,
    readonly takenBy: string,
  ) {
    super("locations.location.name_taken", `Un autre location porte déjà le nom « ${name} ».`);
  }
}

/** L'location visé n'existe pas (→ 404). */
export class LocationNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("locations.location_not_found", `Location introuvable : ${id}.`);
  }
}

/** La table visée n'existe pas dans cet location (→ 404). */
export class LocationTableNotFoundError extends ResourceNotFoundError {
  constructor(locationId: string, tableNumber: number) {
    super(
      "locations.table_not_found",
      `Table ${tableNumber} introuvable dans l'emplacement ${locationId}.`,
    );
  }
}

/**
 * L'location est encore coché par des familles : on refuse de le supprimer.
 *
 * **Business** et non domaine : la règle n'est pas un invariant de l'agrégat —
 * un emplacement ignore les familles — mais une protection de l'exploitation
 * contre elle-même. Elle se satisfait en décochant, donc l'appelant peut agir.
 */
export class LocationInUseError extends BusinessError {
  constructor(id: string, categories: number) {
    super(
      "locations.location_in_use",
      `Emplacement encore vendeur : ${String(categories)} famille(s) le cochent. ` +
        `Décochez-le de leurs canaux avant de le supprimer (${id}).`,
    );
  }
}
