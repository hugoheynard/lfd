/**
 * **D'où l'on est venu saisir une commande, et où l'on y retourne.**
 *
 * La saisie (`/nouvelle-commande/…`) est une page à part, ouverte depuis la
 * liste des commandes ou depuis le comptoir (décidé par Hugo le 2026-11-21).
 * Celui qui l'ouvre écrit son origine dans l'adresse, `?retour=/commandes` ;
 * chaque étape la garde (`queryParamsHandling: 'preserve'`, liens de retour
 * compris) et la lit en `input()`. « Terminer » y ramène sans que la saisie
 * connaisse ceux qui l'ouvrent, et un rechargement ne la perd pas.
 *
 * Le comptoir y ajoute son point de retrait ouvert, `&point=<id>` : c'est lui
 * qui propose le « Retrait immédiat » et le point par défaut du particulier.
 * Sans lui — depuis la liste —, rien de ce qui suppose le client en face.
 */

/** Le paramètre d'adresse qui porte l'origine. */
export const ORDER_ENTRY_RETURN_PARAM = 'retour';
/** Le paramètre d'adresse qui porte le point de retrait du comptoir. */
export const ORDER_ENTRY_POINT_PARAM = 'point';

/** Où l'on retourne quand l'origine manque ou ne se lit pas. */
export const DEFAULT_ORDER_ENTRY_RETURN = '/commandes';

/** La racine de la saisie : une origine qui y pointe tournerait en rond. */
const ORDER_ENTRY_ROOT = '/nouvelle-commande';

/**
 * L'origine admise : un chemin INTERNE au back-office (`/…`, jamais `//…`, qui
 * serait une autre origine), hors de la saisie elle-même. Tout le reste —
 * adresse tapée à la main, lien forgé — retombe sur la liste des commandes.
 */
export function returnTargetOf(raw: string | undefined): string {
  if (raw === undefined || !raw.startsWith('/') || raw.startsWith('//')) {
    return DEFAULT_ORDER_ENTRY_RETURN;
  }
  if (raw === ORDER_ENTRY_ROOT || raw.startsWith(`${ORDER_ENTRY_ROOT}/`)) {
    return DEFAULT_ORDER_ENTRY_RETURN;
  }
  return raw;
}

/** Le libellé du retour, dans les mots de l'écran d'où l'on vient. */
export function returnLabelOf(target: string): string {
  if (target === '/comptoir' || target.startsWith('/comptoir/')) return 'Retour au comptoir';
  if (target === '/commandes' || target.startsWith('/commandes?')) return 'Retour aux commandes';
  return 'Retour';
}

/** Le point de retrait porté par l'adresse, `null` s'il manque. */
export function pointOf(raw: string | undefined): string | null {
  const point = raw?.trim() ?? '';
  return point === '' ? null : point;
}

/** Les paramètres d'adresse qui ouvrent la saisie depuis une origine. */
export function orderEntryParams(
  origin: string,
  point: string | null = null,
): Record<string, string> {
  return {
    [ORDER_ENTRY_RETURN_PARAM]: origin,
    ...(point === null ? {} : { [ORDER_ENTRY_POINT_PARAM]: point }),
  };
}
