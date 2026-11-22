/**
 * **Ce compte a-t-il des commandes ?** — la lecture nommée que les commandes
 * publient pour la suppression d'un compte : seul un compte qui n'a jamais
 * commandé se supprime.
 *
 * Les commandes la DÉCLARENT et l'IMPLÉMENTENT : elles seules savent dans
 * quels sens une commande tient un compte — passée par lui, passée par un de
 * ses sites (il en est le principal), ou réglée par lui (il en est le payeur).
 * Un brouillon ne compte pas. Le compte la compose sans lire leur table.
 */
export abstract class CompanyHasOrdersReader {
  abstract hasOrders(companyId: string): Promise<boolean>;
}
