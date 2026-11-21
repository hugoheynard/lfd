import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * **D'où l'on est venu saisir une commande, et où l'on y retourne.**
 *
 * La saisie (`/nouvelle-commande/…`) est une page à part, ouverte depuis la
 * liste des commandes ou depuis le comptoir (décidé par Hugo le 2026-11-21).
 * Celui qui l'ouvre écrit son origine dans l'adresse, `?retour=/commandes` ;
 * la saisie la retient à l'arrivée ({@link OrderEntryReturnStore}) et la
 * garde d'une étape à l'autre — les liens de retour de fold ne portent pas de
 * paramètres. « Terminer » y ramène sans que la saisie connaisse ceux qui
 * l'ouvrent.
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

/**
 * L'origine et le point de la saisie en cours, retenus pour tout le parcours :
 * le choix, le sélecteur, la saisie. Chaque écran d'ARRIVÉE les relit dans
 * son adresse ({@link noteArrival}) ; les écrans suivants les lisent ici.
 */
@Injectable({ providedIn: 'root' })
export class OrderEntryReturnStore {
  private readonly targetState = signal(DEFAULT_ORDER_ENTRY_RETURN);
  private readonly pointState = signal<string | null>(null);

  readonly target = this.targetState.asReadonly();
  readonly point = this.pointState.asReadonly();
  readonly label = computed(() => returnLabelOf(this.target()));

  /**
   * L'arrivée sur un écran de la saisie. Une adresse qui porte une origine la
   * pose, point compris ; une adresse sans origine (une étape suivante, un
   * rechargement) garde celle du parcours.
   */
  noteArrival(retour: string | undefined, point: string | undefined): void {
    if (retour === undefined) return;
    this.targetState.set(returnTargetOf(retour));
    this.pointState.set(pointOf(point));
  }
}

/**
 * À appeler dans le constructeur d'un écran de la saisie : relit l'origine
 * dans l'adresse d'arrivée, et rend le parcours.
 */
export function orderEntryReturn(): OrderEntryReturnStore {
  const store = inject(OrderEntryReturnStore);
  const params = inject(ActivatedRoute).snapshot.queryParamMap;
  store.noteArrival(
    params.get(ORDER_ENTRY_RETURN_PARAM) ?? undefined,
    params.get(ORDER_ENTRY_POINT_PARAM) ?? undefined,
  );
  return store;
}
