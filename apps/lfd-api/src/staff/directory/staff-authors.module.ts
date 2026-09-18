import { Global, Module } from "@nestjs/common";

import { StaffAuthorDirectory, StaffAuthorReferences } from "./domain/staff-author-directory.js";
import {
  PrismaStaffAuthorDirectory,
  PrismaStaffAuthorReferences,
} from "./infrastructure/prisma-staff-author-directory.js";

/**
 * **Nommer l'auteur d'un acte staff**, depuis n'importe quel bloc.
 *
 * `@Global` pour la même raison que `StaffNotificationsModule` : le référentiel,
 * le fournil, le retrait et le commerce servent tous des auteurs staff, et
 * chacun devrait sinon réimporter l'annuaire. Il n'exporte que deux ports de
 * LECTURE — l'annuaire et ses écritures restent dans `StaffUsersModule`.
 *
 * C'est aussi ce qui sort le commerce de la table `staff_users` : il lisait
 * l'annuaire en Prisma direct, faute d'un port côté staff (dérogation de
 * `lint:prisma-model-ownership` du 2026-09-09, levée avec ce module).
 */
@Global()
@Module({
  providers: [
    { provide: StaffAuthorDirectory, useClass: PrismaStaffAuthorDirectory },
    { provide: StaffAuthorReferences, useClass: PrismaStaffAuthorReferences },
  ],
  exports: [StaffAuthorDirectory, StaffAuthorReferences],
})
export class StaffAuthorsModule {}
