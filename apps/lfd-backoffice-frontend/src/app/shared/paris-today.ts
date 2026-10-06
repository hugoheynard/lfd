/**
 * Le jour **d'aujourd'hui à Paris**, au format `AAAA-MM-JJ`.
 *
 * Passé par `Intl` plutôt que par `toISOString()` : à 23 h en été, l'ISO du
 * navigateur est déjà demain en UTC, et la journée en cours disparaîtrait de la
 * liste une heure avant d'être finie. C'est le fuseau de l'agenda qui fait foi,
 * pas celui de la machine.
 */
export function parisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(now);
}
