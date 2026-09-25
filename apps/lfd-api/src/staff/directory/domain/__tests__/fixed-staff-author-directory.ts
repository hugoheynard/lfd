import { STAFF_ROLE_LABELS, type StaffRole } from "@lfd/contracts";

import { StaffAuthorDirectory, StaffAuthors, type StaffAuthor } from "../staff-author-directory.js";

/**
 * Double de {@link StaffAuthorDirectory} : un annuaire écrit à la main, où
 * chaque référence connue (id de fiche, `sub`, ancien `sub`) désigne une
 * personne. Partagé par les suites de tous les blocs qui nomment un auteur.
 */
export class FixedStaffAuthorDirectory extends StaffAuthorDirectory {
  /** Chaque lot de références demandé, dans l'ordre — une lecture par vue. */
  readonly asked: (readonly (string | null)[])[] = [];

  constructor(private readonly known: ReadonlyMap<string, StaffAuthor> = new Map()) {
    super();
  }

  identify(references: readonly (string | null)[]): Promise<StaffAuthors> {
    this.asked.push(references);
    const found = new Map<string, StaffAuthor>();
    for (const reference of references) {
      const author = reference === null ? undefined : this.known.get(reference);
      if (reference !== null && author !== undefined) {
        found.set(reference, author);
      }
    }
    return Promise.resolve(new StaffAuthors(found));
  }
}

/** Une personne de l'annuaire, reconnue sous chacune des `references` données. */
export function authorsKnownAs(
  person: { firstName: string; lastName: string; staffUserId?: string; role?: StaffRole },
  ...references: readonly string[]
): Map<string, StaffAuthor> {
  const author: StaffAuthor = {
    staffUserId: person.staffUserId ?? "staff_1",
    firstName: person.firstName,
    lastName: person.lastName,
    role: person.role ?? "commercial",
    roleLabel: STAFF_ROLE_LABELS[person.role ?? "commercial"],
    jobTitle: "",
  };
  return new Map(references.map((reference) => [reference, author]));
}
