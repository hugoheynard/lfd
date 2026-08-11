/**
 * Cherche des clients par nom ou adresse — pour désigner le **détenteur** d'un
 * compte qu'on est en train d'ouvrir.
 *
 * Une recherche plutôt qu'une saisie exacte : le commercial connaît le nom de
 * son interlocuteur, rarement l'orthographe de son adresse. Et un client peut
 * détenir plusieurs sociétés : le retrouver est ce qui évite de lui ouvrir un
 * second espace.
 */
export class SearchCustomersQuery {
  constructor(readonly term: string) {}
}
