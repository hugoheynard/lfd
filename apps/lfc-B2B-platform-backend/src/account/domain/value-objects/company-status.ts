/**
 * Où en est une société dans son cycle commercial.
 *
 * - `pending` — déclarée par le client, **pas encore validée**. Elle existe, elle
 *   s'affiche, mais elle ne donne pas accès aux prix ni aux commandes.
 * - `active` — validée par une activation commerciale explicite.
 * - `suspended` — accès coupé sans effacer l'historique.
 *
 * Déclaré **dans le domaine** et non importé du client Prisma : le domaine ne
 * dépend d'aucune infrastructure. La parité avec l'enum Postgres est vérifiée à
 * la compilation dans `infrastructure/company-enum-parity.ts`.
 */
export type CompanyStatus = "pending" | "active" | "suspended";
