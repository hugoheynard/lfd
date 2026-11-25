/**
 * **Ce que le téléphone retient du prévisionnel** (Hugo, 2026-11-25) : le
 * poste qu'on suit et le jour qu'on lisait. Rouvrir l'écran au fournil, c'est
 * le retrouver là où on l'a laissé.
 *
 * En `localStorage` : propre à CE navigateur, et c'est voulu — c'est une
 * posture de lecture d'une personne, pas un réglage d'équipe. Toute lecture ou
 * écriture peut échouer (navigation privée, stockage bloqué) : l'écran retombe
 * alors sur ses défauts, sans rien dire.
 */
const GROUP_KEY = 'lfd.prevision.phone.group';
const DAY_KEY = 'lfd.prevision.phone.day';

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Stockage indisponible : on oublie, l'écran reste juste.
  }
}

/** Le groupe (poste ou rayon) suivi ; vide = tous. */
export const rememberedGroup = (): string | null => read(GROUP_KEY);
export const rememberGroup = (key: string): void => write(GROUP_KEY, key);

/**
 * Le jour lu, s'il n'est pas passé : un jour d'hier rouvrirait une fournée
 * déjà faite, et le matin on vient lire aujourd'hui.
 */
export function rememberedDay(today: string): string | null {
  const day = read(DAY_KEY);
  return day !== null && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today ? day : null;
}
export const rememberDay = (day: string): void => write(DAY_KEY, day);
