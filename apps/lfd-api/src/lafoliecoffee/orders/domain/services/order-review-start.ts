/**
 * **La mise en service du visa des commandes** — une commande passée avant
 * cet instant n'entre jamais dans l'onglet « À vérifier », et ne se vise pas
 * (plan du visa des commandes, V1.3 : décidé par Hugo le 2026-11-21, « les
 * commandes passées à partir de la mise en service »).
 *
 * Une constante du domaine plutôt qu'un réglage : elle ne change pas, se
 * teste avec une horloge fixe, et le harnais e2e n'a rien à semer. Minuit de
 * Paris, le 21 novembre 2026 : le jour où Hugo l'a décidé (le 2026-11-21),
 * pour que les commandes du jour s'y trouvent déjà.
 */
export const ORDER_REVIEW_STARTS_AT = new Date("2026-11-21T00:00:00+01:00");
