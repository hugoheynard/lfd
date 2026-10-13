import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { REQUEST_KINDS, type RequestKind } from '@lfd/contracts';
import {
  FoldNavLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { REQUEST_KIND_GESTURES } from '../request-kinds';
import { RequestReasonsList } from '../request-reasons-list/request-reasons-list';

/** Un onglet par type de demande, dans l'ordre du contrat : un type de plus = un onglet de plus. */
const TABS: readonly FoldTabItem<RequestKind>[] = REQUEST_KINDS.map((kind) => ({
  key: kind,
  label: REQUEST_KIND_GESTURES[kind],
}));

/**
 * **Commercial › Réglages › Motifs des demandes** — ce que le client
 * choisit en écrivant ou en signalant un problème de commande, et où chaque
 * demande part (`documentation/contenu-ecommerce/demandes-clients.md`,
 * §3.4). Le motif ne change pas de type : on le crée dans son onglet.
 *
 * Vue de l'espace Commercial depuis le 2026-10-13 : l'en-tête est celui de la
 * coquille `CommercialPage`, la page ne pose donc pas de `fold-page-layout`.
 */
@Component({
  selector: 'app-request-reasons-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNavLayoutComponent, FoldTabPanelComponent, FoldTabsComponent, RequestReasonsList],
  templateUrl: './request-reasons-page.html',
})
export class RequestReasonsPage {
  protected readonly tabs = TABS;
  protected readonly tab = signal<RequestKind>('contact');
}
