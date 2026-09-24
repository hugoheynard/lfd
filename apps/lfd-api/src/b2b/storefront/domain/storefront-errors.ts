import { instantToLocal } from "@lfd/contracts";

import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la vitrine — plan `documentation/order/plan-vitrine-enregistrement.md`.
 *
 * Ils sont lus par la personne qui compose la vitrine, sans la grille ni le
 * code sous les yeux : chacun nomme ce qui cloche et le geste qui en sort.
 * L'éditeur refuse la plupart d'entre eux avant d'envoyer ; le serveur les
 * refuse quand même, parce qu'il est l'autorité.
 */

/**
 * **Quelqu'un a enregistré la vitrine depuis qu'on l'a chargée** (**409**, D6).
 *
 * Pas de nom : il demanderait de résoudre une fiche staff, pour un conflit
 * rare. L'heure suffit à se situer.
 */
export class StorefrontChangedError extends BusinessError {
  constructor(changedAt: Date | null) {
    const when = changedAt === null ? "" : ` à ${instantToLocal(changedAt).time}`;
    super(
      "storefront.changed",
      `La vitrine a été modifiée${when} pendant que vous travailliez — rechargez pour reprendre la dernière version.`,
    );
  }
}

/**
 * Un objet cité par son identifiant n'est pas dans la vitrine chargée
 * (**409**) : archivé entre-temps, ou jamais existé. Recharger rend la liste
 * à jour.
 */
export class StorefrontObjectUnknownError extends BusinessError {
  constructor(kind: "objet" | "gabarit", id: string) {
    super(
      "storefront.unknown",
      `Le ${kind} ${id} n'est plus dans la vitrine — rechargez pour reprendre la dernière version.`,
    );
  }
}

/**
 * Une composition qui ne tient pas (**400**) : chevauchement, débordement,
 * rayon sans page, texte trop long, réglage hors bornes. Le message dit
 * lequel, et où.
 *
 * Une seule classe pour ces refus, un `code` par cas : ils ont la même
 * catégorie et le même geste de sortie (corriger la composition), et une
 * classe par phrase multiplierait les fichiers sans rien dire de plus.
 */
export class InvalidStorefrontError extends DomainError {
  constructor(code: StorefrontRefusal, message: string) {
    super(`storefront.${code}`, message);
  }
}

/**
 * On a demandé l'état à écrire d'une vitrine qu'aucune composition n'a
 * modifiée (**500**) : une faute de code, jamais une saisie.
 */
export class StorefrontNotComposedError extends TechnicalError {
  constructor() {
    super(
      "storefront.not_composed",
      "La vitrine n'a rien à enregistrer : aucune composition reçue.",
    );
  }
}

/** Les cas de {@link InvalidStorefrontError}. */
export type StorefrontRefusal =
  | "text"
  | "shelf_key"
  | "sku"
  | "operation"
  | "action"
  | "image"
  | "settings"
  | "page"
  | "placement"
  | "contents"
  | "template"
  | "duplicate";
