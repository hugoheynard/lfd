/**
 * Le rôle d'une personne dans une société, tel que la requête partagée le lit.
 *
 * Miroir de `CompanyRole` (`b2b/account/domain/value-objects/company-role.ts`)
 * et de l'enum Prisma `CustomerRole` : `b2b/shared/` n'importe que
 * `platform/`, il ne peut donc pas emprunter le type d'un contexte. Les
 * littéraux sont les mêmes, et chaque lecteur l'affecte à son propre type —
 * le compilateur refuse la première divergence.
 */
export type StandingRole = "owner" | "admin" | "orders" | "billing";
