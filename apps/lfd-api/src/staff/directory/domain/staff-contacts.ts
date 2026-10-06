/**
 * **Comment joindre une personne de l'annuaire** — un port de LECTURE, pour
 * les blocs qui écrivent à du personnel sans posséder l'annuaire (le dossier
 * du jour du fournil, plan `documentation/production/plan-envoi-du-dossier.md`,
 * E2).
 *
 * Un port à part de {@link StaffAuthorDirectory} (ISP) : nommer l'auteur d'un
 * acte et trouver l'adresse d'une personne sont deux questions, et la seconde
 * expose l'e-mail que la première n'a pas à connaître.
 */
export abstract class StaffContacts {
  /**
   * Les fiches désignées par leur id, suspendues comprises (`active: false`) :
   * c'est l'appelant qui décide de ce qu'il fait d'une personne suspendue. Un
   * id inconnu est absent du résultat.
   */
  abstract contactsOf(staffUserIds: readonly string[]): Promise<ReadonlyMap<string, StaffContact>>;
}

/**
 * **Le personnel qu'on peut choisir comme destinataire** : les fiches non
 * suspendues qui ont une adresse, par nom. Un port distinct de
 * {@link StaffContacts} (ISP) : lister et résoudre sont deux lecteurs.
 */
export abstract class ReachableStaff {
  abstract list(): Promise<readonly StaffContact[]>;
}

/** Une personne de l'annuaire et son adresse d'aujourd'hui. */
export interface StaffContact {
  readonly staffUserId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** Vide quand la fiche n'en porte pas. */
  readonly jobTitle: string;
  /** `false` : la fiche est suspendue. */
  readonly active: boolean;
}
