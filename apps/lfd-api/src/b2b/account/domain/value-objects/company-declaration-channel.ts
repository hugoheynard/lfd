/**
 * Par qui une société a été déclarée : le client lui-même (porte pro, « Mes
 * entreprises »), ou le staff (création au back-office, sous-compte).
 *
 * C'est un fait de NAISSANCE : décidé une fois, à la déclaration, jamais muté.
 * Il vivait seulement dans la charge du fait `company.declared` du journal ;
 * Comptes clients ne pouvait donc pas trier les inscrits seuls sans lire le
 * journal de `growth` (plan `documentation/b2b/plan-auto-acquisition-pro.md`,
 * § 5, lot P1).
 */
export type CompanyDeclarationChannel = "self" | "staff";
