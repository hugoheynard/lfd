const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' });
const TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * **L'arrêt automatique encore à venir** de la journée que le bouton du soir
 * viserait, dit sur le bouton (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §5).
 *
 * Avant cet instant (la fin du rattrapage de l'heure limite générale), le
 * serveur refuse un arrêt à la main : le bouton ne le propose pas, il dit
 * quand le plan s'arrêtera seul. `null` quand l'instant est passé ou qu'il
 * n'y en a pas (aucune heure limite posée) — l'arrêt à la main reste ouvert,
 * pour rattraper un arrêt automatique qui n'a pas abouti.
 *
 * À l'heure de Paris, quel que soit le fuseau du poste : c'est l'heure de la
 * maison, celle que l'écran des réglages affiche.
 */
export function autoCloseAheadLabel(closesAt: string | null, now: Date): string | null {
  if (closesAt === null) {
    return null;
  }
  const at = new Date(closesAt);
  if (at.getTime() <= now.getTime()) {
    return null;
  }
  return `Arrêt automatique ${WEEKDAY.format(at)} à ${TIME.format(at)}`;
}
