import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { StaffDirectory, type StaffIdentity } from "../domain/ports/staff-directory.js";

/**
 * Adaptateur de {@link StaffDirectory} sur l'annuaire staff local.
 *
 * La jointure `sub → fiche` se fait par `auth0Id`, la seule colonne qui relie un
 * token à une personne. Elle est **nullable** tant que le provisioning de
 * connexion n'est pas branché : beaucoup de fiches n'en ont pas encore, et un
 * `sub` de développement n'en aura jamais. D'où le `null` rendu sans bruit —
 * l'appelant garde l'identifiant, qui reste la trace utile.
 *
 * Cet adaptateur vit dans `account/` (et non dans `staff-users/`) parce que la
 * dépendance qu'il satisfait est celle d'`account` : le domaine déclare le port
 * étroit dont il a besoin, l'infrastructure le branche sur la table voisine.
 */
@Injectable()
export class PrismaStaffDirectory extends StaffDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async identify(subject: string): Promise<StaffIdentity | null> {
    if (subject.trim() === "") {
      return null;
    }
    const row = await this.prisma.staffUser.findUnique({
      where: { auth0Id: subject },
      select: { firstName: true, lastName: true, scopes: true },
    });
    if (row === null) {
      return null;
    }
    return {
      name: `${row.firstName} ${row.lastName}`.trim(),
      // Plusieurs périmètres possibles : on les garde tous, dans l'ordre de la
      // fiche. Le titre affiché en trace doit dire ce qu'il en était, pas
      // choisir arbitrairement lequel « compte ».
      role: row.scopes.join(", "),
    };
  }
}
