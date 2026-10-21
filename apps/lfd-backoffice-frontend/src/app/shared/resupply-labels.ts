import { instantToLocal, type ResupplyTarget } from '@lfd/contracts';

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * « mercredi 9 septembre » pour `2026-09-09`. Une journée nue n'a pas de
 * fuseau : elle se lit en UTC, pour que le poste ne la décale pas.
 */
export function resupplyDayLabel(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** « 18:00 » : l'heure de Paris d'un instant ISO, celle du four. */
export function parisClock(iso: string): string {
  return instantToLocal(new Date(iso)).time;
}

/** Le nom d'une visée, tel que le comptoir l'a choisi. */
export const RESUPPLY_TARGET_LABELS: Readonly<Record<ResupplyTarget, string>> = {
  tomorrow: 'Pour demain',
  asap: 'Au plus tôt',
};

/**
 * La marque d'un réassort envoyé par le fournil, à part de la demande du
 * comptoir (lot R1d) — la même sur l'écran du fournil et à la réception.
 */
export const BAKEHOUSE_ORIGIN_MARK = 'Envoyé par le fournil';

/**
 * Le titre d'un réassort nommé (R1g, Hugo 2026-10-21) : « Vitrine du matin —
 * Village ». Sans nom, `unnamed` — l'affichage de l'endroit tel qu'avant le
 * nom. Même forme que `resupplyTitleOf` de `@lfd/contracts`, recopiée ici
 * pour ne pas faire dépendre l'écran d'un export neuf du paquet, que le
 * pré-bundle du serveur de dev ne verrait pas.
 */
export function resupplyTitle(name: string | null, siteLabel: string, unnamed: string): string {
  return name === null ? unnamed : `${name} — ${siteLabel}`;
}
