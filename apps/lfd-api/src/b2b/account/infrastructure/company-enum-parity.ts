import type {
  CompanyStatus as PrismaCompanyStatus,
  CustomerRole as PrismaCustomerRole,
  SuspensionCause as PrismaSuspensionCause,
} from "../../../platform/database/client/client.js";
import type {
  CompanyMemberRole,
  CompanyStatus as ContractCompanyStatus,
  SuspensionCause as ContractSuspensionCause,
} from "@lfd/contracts";
import type {
  OrderCompanyStatus,
  OrderRole,
} from "../../orders/domain/ports/order-guard.reader.js";
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

/**
 * ── LES MIROIRS D'AILLEURS ──────────────────────────────────────────────────
 *
 * Les trois gardes ci-dessus couvraient le contexte `account`. Elles ne
 * couvraient pas les copies que d'AUTRES contextes tiennent des mêmes enums —
 * et ces copies existent pour une bonne raison : le contexte `orders` refuse de
 * dépendre des internes d'`account`, ce qui est du découplage sain. Le prix de
 * ce découplage, c'est la dérive, et le prix de la dérive se paie au runtime.
 *
 * L'audit du 2026-08-29 a montré à quoi ça ressemble quand personne ne garde :
 * un rôle de membre comparé côté boutique à `company_admin`, une valeur que
 * l'enum n'a jamais portée, sur SEPT écrans.
 *
 * On ne fusionne donc pas les copies — on les VÉRIFIE. Cette section est le
 * seul endroit du dépôt qui connaisse à la fois les enums Postgres, les unions
 * du domaine et celles des contrats.
 */

/** Casse si le rôle du contexte `orders` diverge de l'enum Postgres. */
export type OrderRoleParity = Assert<Equals<OrderRole, `${PrismaCustomerRole}`>>;

/** Casse si le statut lu par le contexte `orders` diverge de l'enum Postgres. */
export type OrderCompanyStatusParity = Assert<Equals<OrderCompanyStatus, `${PrismaCompanyStatus}`>>;

/**
 * Casse si le rôle publié aux fronts diverge de l'enum Postgres.
 *
 * C'est LA garde qui manquait : `CompanyMemberRole` est ce que les deux
 * frontends lisent, et rien ne le reliait à la base.
 */
export type ContractRoleParity = Assert<Equals<CompanyMemberRole, `${PrismaCustomerRole}`>>;

/** Casse si le statut publié aux fronts diverge de l'enum Postgres. */
export type ContractStatusParity = Assert<Equals<ContractCompanyStatus, `${PrismaCompanyStatus}`>>;

/** Casse si la cause de suspension publiée aux fronts diverge de l'enum Postgres. */
export type ContractSuspensionParity = Assert<
  Equals<ContractSuspensionCause, `${PrismaSuspensionCause}`>
>;
