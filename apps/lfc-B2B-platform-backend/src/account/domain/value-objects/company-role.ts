/**
 * Rôle d'une personne **dans une société donnée**.
 *
 * - `company_admin` — gestionnaire : administre les membres et les commandes de
 *   cette société. C'est le rôle du créateur.
 * - `member` — passe des commandes.
 *
 * Le rôle appartient au rattachement, pas à la personne : on peut être
 * gestionnaire d'une société et simple membre d'une autre.
 *
 * Déclaré **dans le domaine** et non importé du client Prisma (cf.
 * `CompanyStatus` pour le garde-fou de parité).
 */
export type CompanyRole = "company_admin" | "member";
