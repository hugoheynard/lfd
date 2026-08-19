import { Global, Module } from "@nestjs/common";

import { StaffAccessResolver } from "../platform/auth/staff-access.resolver.js";
import { PrismaStaffAccessResolver } from "../staff/permissions/prisma-staff-access.resolver.js";
import { StaffUsersModule } from "../staff/staff.module.js";

/**
 * **La résolution d'accès staff, reliée.** Un module dont c'est le seul objet :
 * brancher le port déclaré par la couche technique sur l'adaptateur qui lit
 * l'annuaire.
 *
 * Même forme que `CatalogFeedModule`, et pour la même raison : le consommateur
 * du port est `StaffAccessGuard`, qui vit dans `infra/auth` et ne peut pas
 * importer le bloc `staff` sans renverser la matrice des frontières. Seule la
 * racine de composition a le droit de voir les deux côtés.
 *
 * `@Global` par nécessité, pas par commodité : le guard s'attache aux
 * contrôleurs par `@AdminSurface(...)`, donc il se résout dans le module de
 * chaque contrôleur — il faut que le binding y soit visible partout.
 */
@Global()
@Module({
  imports: [StaffUsersModule],
  // `useExisting`, JAMAIS `useClass` : l'adaptateur porte un cache court, et
  // l'annuaire le vide au moment exact où il change une fiche. Deux
  // instanciations donneraient deux caches — l'annuaire viderait le sien, le
  // guard lirait l'autre, et une suspension mettrait trente secondes à mordre.
  // C'est un e2e qui l'a dit, pas une relecture.
  providers: [{ provide: StaffAccessResolver, useExisting: PrismaStaffAccessResolver }],
  exports: [StaffAccessResolver],
})
export class StaffAccessModule {}
