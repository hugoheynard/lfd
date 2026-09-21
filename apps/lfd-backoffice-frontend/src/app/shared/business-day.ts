import { localToInstant } from '@lfd/contracts';

/**
 * **Le début d'une journée d'exploitation, à Paris.**
 *
 * Un `<input type="date">` rend un jour nu — `2026-01-01` —, et l'API attend un
 * instant. La conversion a l'air d'un détail et n'en est pas un : le commercial
 * qui écrit « à partir du 1er janvier » veut dire **minuit chez lui**.
 *
 * ## Ce que faisait le code avant le 2026-09-08
 *
 * `new Date(\`${day}T00:00:00.000Z\`)` — minuit **UTC**. À Paris, la fenêtre
 * s'ouvrait donc à 01 h 00 en hiver, 02 h 00 en été. Pendant ces une à deux
 * heures, le client payait le tarif d'avant, et rien ne le signalait : la trace
 * figée sur sa commande disait la vérité — le prix appliqué était bien celui de
 * la règle en vigueur à cet instant-là.
 *
 * Le décalage se voit d'autant moins qu'il ne se voit **jamais** l'après-midi,
 * et qu'un tarif se pose rarement à trois heures du matin.
 *
 * ## Pourquoi passer par `paris-time` plutôt que par un décalage
 *
 * Parce que le décalage change deux fois par an. Une constante `+1h` serait
 * juste six mois sur douze, et personne ne saurait laquelle des deux moitiés on
 * regarde. `localToInstant` connaît le fuseau du métier (`BUSINESS_TIME_ZONE`)
 * et le passage à l'heure d'été. Il n'était pas inutilisé : il sert déjà les
 * créneaux de rendez-vous et les heures limites de commande (vérifié le
 * 2026-09-08). Il ne servait simplement pas la tarification.
 *
 * @returns `null` si le jour est vide ou mal formé — l'appelant décide, parce
 *   qu'une fenêtre absente et une fenêtre invalide ne se traitent pas pareil.
 */
export function businessDayStart(day: string): string | null {
  return localToInstant(day, '00:00')?.toISOString() ?? null;
}
