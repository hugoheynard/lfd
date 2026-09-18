import { Injectable } from "@nestjs/common";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { StaffDirectory, type StaffIdentity } from "../domain/ports/staff-directory.js";

/**
 * Adaptateur de {@link StaffDirectory} sur le port d'auteurs du bloc staff.
 *
 * Il lisait `staff_users` en Prisma direct, par `auth0Id` seulement — une
 * dérogation de `lint:prisma-model-ownership` (2026-09-09) qui attendait un
 * port côté staff. Ce port existe : l'adaptateur le traduit, et reconnaît
 * désormais les trois formes d'un auteur — id de fiche, `sub` actuel, `sub`
 * ancien (plan `plan-l-auteur-est-la-fiche.md`, D4).
 *
 * `null` rendu sans bruit pour tout le reste (marqueur, `sub` de
 * développement, fiche inconnue) : l'appelant garde l'identifiant, qui reste
 * la trace utile.
 */
@Injectable()
export class StaffBlockDirectory extends StaffDirectory {
  constructor(private readonly authors: StaffAuthorDirectory) {
    super();
  }

  async identify(subject: string): Promise<StaffIdentity | null> {
    const author = (await this.authors.identify([subject])).find(subject);
    if (author === null) {
      return null;
    }
    return {
      name: `${author.firstName} ${author.lastName}`.trim(),
      // La **fonction** si elle est renseignée, sinon le rôle : une trace se lit
      // par un humain, et « Responsable grands comptes » lui dit plus que
      // « commercial ». Le rôle reste le repli, jamais une chaîne vide.
      role: author.jobTitle.trim() === "" ? author.role : author.jobTitle,
    };
  }
}
