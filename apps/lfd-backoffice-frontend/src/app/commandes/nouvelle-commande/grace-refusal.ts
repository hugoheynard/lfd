import { httpErrorCode } from '@lfd/endpoints';

/**
 * Le refus « la limite est passée, **mais c'est encore rattrapable** ».
 *
 * On teste le **code**, jamais le message : celui-ci est écrit pour être lu par
 * un humain, et un relecteur a le droit de le reformuler sans casser un
 * enchaînement d'écran.
 */
const GRACE_REFUSAL = 'orders.cutoff.grace';

/**
 * Ce refus-ci ouvre-t-il un rattrapage&nbsp;?
 *
 * Un prédicat nommé plutôt qu'une comparaison en ligne dans le composant : c'est
 * la seule décision de cet écran qui se prend sur une réponse du serveur, et
 * elle mérite d'être éprouvée sans monter un `TestBed`.
 *
 * ⚠️ `orders.cutoff.past` n'en est **pas** un : après la grâce, personne
 * n'ouvre, et proposer une dérogation là coûterait un appel pour rien — plus la
 * confiance qui va avec.
 */
export function isGraceRefusal(error: unknown): boolean {
  return httpErrorCode(error) === GRACE_REFUSAL;
}
