/**
 * Fait de domaine : **une fiche invité vient de devenir un compte** — la
 * première entrée d'un `sub` inconnu, par une connexion qui prouve l'adresse,
 * a posé ce `sub` sur l'unique fiche invité de cette adresse (R1 du plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`).
 *
 * Pendant de `UserRegisteredEvent` pour qui avait déjà commandé sans
 * compte : la croissance le compte comme une inscription, la fidélité crédite
 * aussitôt les commandes définitives de ce titulaire. Publié seulement par la
 * requête qui a GAGNÉ l'écriture conditionnelle.
 */
export class GuestAccountClaimedEvent {
  constructor(readonly userId: string) {}
}
