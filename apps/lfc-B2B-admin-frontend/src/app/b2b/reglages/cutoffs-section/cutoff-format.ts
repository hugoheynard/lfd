import type { OrderCutoffView } from '@lfd/contracts';

/**
 * Les jours vivaient ICI et n'y servaient qu'aux heures limites. Les créneaux
 * publics en ont le même besoin, alors ils sont montés d'un cran — les recopier
 * aurait fait deux vérités sur les jours de la semaine. Réexportés pour que les
 * lecteurs de ce module n'aient rien à changer.
 */
export { WEEKDAY_CHOICES, weekdayLabel } from '../weekday-choices';

/** À qui s'applique la règle : un point nommé, ou le défaut de la plateforme. */
export function scopeLabel(rule: OrderCutoffView): string {
  return rule.pickupLabel ?? 'Tous les points (défaut)';
}

/**
 * La règle en une phrase : « La veille à 18:00 », « L'avant-veille à 18:00 »,
 * « Le jour même à 06:30 ».
 *
 * Une phrase plutôt que « J−1 · 18:00 » parce que c'est ce qu'on dira au
 * téléphone, et parce qu'un `daysBefore` nu se lit à l'envers une fois sur deux.
 */
export function cutoffSentence(rule: OrderCutoffView): string {
  return `${dayPhrase(rule.daysBefore)} à ${rule.time}`;
}

function dayPhrase(daysBefore: number): string {
  switch (daysBefore) {
    case 0:
      return 'Le jour même';
    case 1:
      return 'La veille';
    case 2:
      return "L'avant-veille";
    default:
      return `${daysBefore} jours avant`;
  }
}

/**
 * Les rattrapages proposés. Des paliers plutôt qu'un champ libre : ce réglage se
 * discute en quarts d'heure, et une saisie libre inviterait le « 37 min » que
 * personne ne saura justifier six mois plus tard.
 */
export const GRACE_CHOICES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: 'Aucun — la limite est ferme' },
  { value: 15, label: "15 minutes après l'heure" },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 heure' },
  { value: 120, label: '2 heures' },
];

/**
 * Le rattrapage en clair, ou `null` quand il n'y en a pas.
 *
 * `null` plutôt qu'une phrase vide : l'absence de rattrapage n'est pas une
 * information à afficher sur chaque ligne, c'est le cas normal. Ne rien montrer
 * fait ressortir les règles qui, elles, en ont un.
 */
export function graceSentence(rule: OrderCutoffView): string | null {
  if (rule.graceMinutes === 0) {
    return null;
  }
  if (rule.graceMinutes % 60 === 0) {
    const hours = rule.graceMinutes / 60;
    return `+ ${hours} h de rattrapage`;
  }
  return `+ ${rule.graceMinutes} min de rattrapage`;
}
