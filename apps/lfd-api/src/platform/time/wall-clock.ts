/**
 * Port **WallClock** — l'heure du MUR, qui avance pendant qu'on attend.
 *
 * `Clock` rend l'instant **gelé à l'ingress** dès qu'un `RequestContext`
 * existe (`system-clock.ts`), et ce contexte suit les continuations
 * asynchrones — un balayage, un bouton, un rappel d'après validation. Un bail
 * ou une échéance de reprise calculés dessus seraient en retard de toute la
 * durée d'un appel réseau (plan `documentation/commandes/annulation/plan-annulation-de-commande.md`,
 * C4.7).
 *
 * 🔴 Il ne sert QU'À mesurer un bail et une échéance de reprise — jamais un
 * instant métier : ce qu'on écrit comme fait (une demande, une émission, le
 * journal) reste au `Clock`.
 */
export abstract class WallClock {
  /** L'instant présent, relu à chaque appel. */
  abstract elapsedNow(): Date;
}
