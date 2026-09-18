import type { StaffRole } from "@lfd/contracts";

/**
 * **Qui est l'auteur d'un acte staff**, quelle que soit la forme sous laquelle
 * il a été écrit.
 *
 * Un auteur staff se lit aujourd'hui sous trois formes, et c'est transitoire
 * (plan `documentation/staff/plan-l-auteur-est-la-fiche.md`, D4) :
 *
 * 1. l'**id de la fiche** — la forme cible, déjà écrite par quelques colonnes ;
 * 2. le **`sub` actuel** de la fiche (`staff_users.auth0_id`) ;
 * 3. un **`sub` ancien**, que la fiche a porté puis perdu — gardé par la table
 *    des `sub` (`staff_subject_aliases`, D5).
 *
 * Tant que l'histoire n'est pas convertie, un lecteur qui ne connaîtrait
 * qu'une forme nommerait une moitié des actes et laisserait l'autre en
 * identifiant brut. Ce port les résout toutes, dans cet ordre.
 *
 * Tout le reste — un marqueur (`seed-pim`, `sonde`, `system`), un `sub` jamais
 * lié — ne désigne **personne** : il est absent du résultat, et l'appelant
 * garde la valeur brute. Inventer un nom serait pire que le trou.
 */
export abstract class StaffAuthorDirectory {
  /**
   * Résout d'un coup toutes les références d'une vue : une lecture par vue,
   * pas une par ligne. Les `null` et les doublons sont admis et ignorés.
   */
  abstract identify(references: readonly (string | null)[]): Promise<StaffAuthors>;
}

/**
 * **Toutes les références sous lesquelles une personne a pu écrire** — pour
 * filtrer un journal par personne sans couper son histoire en deux.
 *
 * Un port à part et non une méthode de plus sur {@link StaffAuthorDirectory}
 * (ISP) : nommer un auteur et retrouver tous ses identifiants sont deux
 * questions, posées par des lecteurs différents.
 */
export abstract class StaffAuthorReferences {
  /**
   * L'id de la fiche que désigne `reference`, son `sub` actuel et tous ceux de
   * la table des `sub` — `reference` compris, toujours. Une référence qui ne
   * désigne aucune fiche se rend seule : filtrer par elle reste possible.
   */
  abstract referencesOf(reference: string): Promise<readonly string[]>;
}

/** Une personne de l'annuaire, telle qu'on la nomme aujourd'hui. */
export interface StaffAuthor {
  readonly staffUserId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: StaffRole;
  readonly jobTitle: string;
}

/** Le résultat d'une résolution : un auteur par référence reconnue. */
export class StaffAuthors {
  constructor(private readonly byReference: ReadonlyMap<string, StaffAuthor>) {}

  /** Aucune référence reconnue — le résultat d'une vue sans auteur. */
  static none(): StaffAuthors {
    return new StaffAuthors(new Map());
  }

  /** La fiche que désigne `reference`, ou `null` si elle ne désigne personne. */
  find(reference: string | null): StaffAuthor | null {
    return reference === null ? null : (this.byReference.get(reference) ?? null);
  }

  /**
   * « Prénom Nom », ou `null` : une référence inconnue, ou une fiche sans nom.
   * Le front affiche alors la valeur brute, qui reste la trace utile.
   */
  nameOf(reference: string | null): string | null {
    const author = this.find(reference);
    return author === null ? null : staffAuthorName(author);
  }
}

/** « Prénom Nom », ou `null` si la fiche n'en porte aucun. */
export function staffAuthorName(author: StaffAuthor): string | null {
  const name = `${author.firstName} ${author.lastName}`.trim();
  return name === "" ? null : name;
}
