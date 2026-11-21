import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { FoldTabItem } from 'fold-ng';
import { map } from 'rxjs';

/**
 * Les trois onglets d'une commande, vue du staff : ce qu'elle est et ce qu'on
 * en fait, les pièces qu'elle a produites, et ce qui lui est arrivé.
 */
export type OrderViewTab = 'detail' | 'documents' | 'history';

/** Le paramètre d'adresse qui porte l'onglet : une fiche se partage ouverte au bon endroit. */
export const ORDER_VIEW_TAB_PARAM = 'onglet';

/** La valeur lue dans l'adresse, en français : c'est elle qu'on voit et qu'on recopie. */
const SLUG_BY_TAB: Readonly<Record<OrderViewTab, string>> = {
  detail: 'detail',
  documents: 'documents',
  history: 'historique',
};

export const ORDER_VIEW_TABS: readonly FoldTabItem<OrderViewTab>[] = [
  { key: 'detail', label: 'Détail' },
  { key: 'documents', label: 'Documents' },
  { key: 'history', label: 'Historique' },
];

/** L'onglet que dit l'adresse ; « Détail » quand elle ne dit rien, ou rien qu'on connaisse. */
export function tabFromQuery(slug: string | null): OrderViewTab {
  const found = ORDER_VIEW_TABS.find((tab) => SLUG_BY_TAB[tab.key] === slug);
  return found === undefined ? 'detail' : found.key;
}

/** Ce que l'adresse porte pour cet onglet — rien pour « Détail », l'onglet par défaut. */
export function queryForTab(tab: OrderViewTab): string | null {
  return tab === 'detail' ? null : SLUG_BY_TAB[tab];
}

/** L'onglet ouvert et le geste qui en change — l'adresse est le seul état. */
export interface OrderViewTabState {
  readonly tab: Signal<OrderViewTab>;
  choose(tab: OrderViewTab): void;
}

/**
 * Lit l'onglet dans l'adresse (`?onglet=`), et en change en la réécrivant sans
 * ajouter d'entrée à l'historique. La page qui porte la barre et la vue qui
 * porte les panneaux lisent la MÊME adresse : un seul état, jamais deux.
 * À appeler dans un contexte d'injection.
 */
export function injectOrderViewTab(): OrderViewTabState {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const tab = toSignal(
    route.queryParamMap.pipe(map((params) => tabFromQuery(params.get(ORDER_VIEW_TAB_PARAM)))),
    { initialValue: tabFromQuery(route.snapshot.queryParamMap.get(ORDER_VIEW_TAB_PARAM)) },
  );
  return {
    tab,
    choose(next: OrderViewTab): void {
      void router.navigate([], {
        relativeTo: route,
        queryParams: { [ORDER_VIEW_TAB_PARAM]: queryForTab(next) },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    },
  };
}
