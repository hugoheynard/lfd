/** Le fuseau du fournil : l'heure lue est celle de la boutique, pas celle du poste. */
const SHOP_TIME_ZONE = 'Europe/Paris';

/** Le jour calendaire de Paris d'un instant, en `AAAA-MM-JJ`. */
function shopDayOf(instant: Date): string {
  return instant.toLocaleDateString('en-CA', { timeZone: SHOP_TIME_ZONE });
}

/**
 * La pastille d'un compte qui a un brouillon : « Brouillon · 14 h 32 » s'il a
 * été enregistré aujourd'hui, « Brouillon · 2 nov. » sinon — l'heure d'un autre
 * jour ne dirait rien sans le jour.
 */
export function draftBadgeLabel(savedAt: string, now: Date): string {
  const saved = new Date(savedAt);
  if (shopDayOf(saved) === shopDayOf(now)) {
    const [hours, minutes] = saved
      .toLocaleTimeString('fr-FR', {
        timeZone: SHOP_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
      })
      .split(':');
    return `Brouillon · ${String(Number(hours))} h ${minutes ?? '00'}`;
  }
  const day = saved.toLocaleDateString('fr-FR', {
    timeZone: SHOP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  });
  return `Brouillon · ${day}`;
}
