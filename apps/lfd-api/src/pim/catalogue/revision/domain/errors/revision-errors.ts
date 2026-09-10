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
 * **Une ancre déjà nommée ne se renomme pas.**
 *
 * Le nom dit l'intention avec laquelle un catalogue est parti chez des clients.
 * Le réécrire ne corrige pas le passé — il le raconte autrement, et l'écran qui
 * relit une publication d'il y a trois mois lirait alors une intention que
 * personne n'avait ce jour-là.
 *
 * Le geste offert est donc étroit : **nommer ce qui ne l'était pas**. Les
 * ancres muettes d'avant la règle se réparent ; les autres sont acquises.
 */
export class RevisionAlreadyNamedError extends BusinessError {
  constructor(
    readonly reference: string,
    readonly label: string,
  ) {
    super(
      "catalogue.revision.already_named",
      `La révision « ${reference} » s'appelle déjà « ${label} ». Une ancre ne se renomme pas : elle dit avec quelle intention un catalogue est parti.`,
    );
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
