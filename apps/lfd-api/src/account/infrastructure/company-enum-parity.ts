import type {
  CompanyStatus as PrismaCompanyStatus,
  CustomerRole as PrismaCustomerRole,
  SuspensionCause as PrismaSuspensionCause,
} from "../../infra/database/client/client.js";
import type { CompanyRole } from "../domain/value-objects/company-role.js";
import type { CompanyStatus } from "../domain/value-objects/company-status.js";
import type { SuspensionCause } from "../domain/value-objects/suspension-cause.js";

/**
 * Garde-fou de **compilation** entre les unions du domaine et les enums Postgres.
 *
 * Le domaine redéclare ces valeurs pour ne dépendre d'aucune infrastructure — au
 * prix d'un risque de dérive : ajouter `archived` à l'enum Prisma sans toucher au
 * domaine passerait inaperçu, et l'adaptateur renverrait une valeur que le
 * domaine dit impossible. Cette vérification vit ICI, dans la couche qui connaît
 * les deux mondes, et casse le build à la première divergence.
 *
 * Il n'y a **rien à exécuter** : ce fichier ne produit aucun code au runtime.
 */
/**
 * Égalité **stricte** de deux types. La double fonction générique est le seul
 * moyen en TypeScript de comparer deux unions sans que l'une puisse simplement
 * être assignable à l'autre : `'a'` est assignable à `'a' | 'b'`, mais les deux
 * types ne sont pas égaux — et c'est exactement la dérive à détecter.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Ne compile que si son argument est `true`. */
type Assert<T extends true> = T;

/** Casse si `CompanyStatus` (domaine) et l'enum Postgres divergent. */
export type CompanyStatusParity = Assert<Equals<CompanyStatus, `${PrismaCompanyStatus}`>>;

/** Casse si `CompanyRole` (domaine) et l'enum Postgres divergent. */
export type CompanyRoleParity = Assert<Equals<CompanyRole, `${PrismaCustomerRole}`>>;

/** Casse si `SuspensionCause` (domaine) et l'enum Postgres divergent. */
export type SuspensionCauseParity = Assert<Equals<SuspensionCause, `${PrismaSuspensionCause}`>>;
