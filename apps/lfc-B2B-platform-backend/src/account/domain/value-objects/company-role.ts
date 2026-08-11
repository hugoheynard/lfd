/**
 * Rôle d'une personne **dans une société donnée**.
 *
 * - `owner` — le **détenteur** : celui dont l'adresse a ouvert le compte. Il
 *   n'est pas attribué, il est constaté ;
 * - `admin` — administre l'espace : interlocuteurs, adresses, identité ;
 * - `orders` — passe les commandes ;
 * - `billing` — suit les règlements et les factures.
 *
 * Le rôle appartient au rattachement, pas à la personne : on peut être
 * gestionnaire d'une société et simple membre d'une autre.
 *
 * Déclaré **dans le domaine** et non importé du client Prisma (cf.
 * `CompanyStatus` pour le garde-fou de parité).
 */
export type CompanyRole = "owner" | "admin" | "orders" | "billing";
