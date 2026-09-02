import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";

/** On compare à une ancre qui n'existe pas. */
export class RevisionNotFoundError extends ResourceNotFoundError {
  constructor(readonly reference: string) {
    super("catalogue.revision.not_found", `Révision « ${reference} » inconnue.`);
  }
}

/**
 * La base a refusé une ancre : une autre porte déjà cette empreinte.
 *
 * ⚠️ Ce n'est **pas** une erreur d'appelant, et elle ne doit normalement jamais
 * sortir. La garde applicative demande « cette ancre existe-t-elle ? » avant
 * d'écrire ; ce refus-ci ne survient qu'à la **course** — deux pushs simultanés
 * lisent tous deux « non », calculent la même empreinte et écrivent tous deux.
 * L'appelant qui perd la course rattrape l'ancre du gagnant : il voulait cette
 * ancre-là, elle existe, il l'a.
 *
 * Elle est nommée plutôt que laissée en violation Prisma pour que ce rattrapage
 * soit **exprimable** : le handler ne peut pas lire un code d'erreur de la base
 * sans savoir quelle base il a en face.
 */
export class RevisionHashAlreadyTakenError extends BusinessError {
  constructor(readonly hash: string) {
    super(
      "catalogue.revision.hash_already_taken",
      "Une autre ancre porte déjà cette empreinte de catalogue.",
    );
  }
}
