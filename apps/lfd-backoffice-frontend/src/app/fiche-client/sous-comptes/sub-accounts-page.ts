import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CompanyFollowAspect, FollowedAspectView } from '@lfd/contracts';
import { formatOrderDate } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { FOLLOW_ASPECT_LABELS } from '../../comptes-clients/admin-company';
import { FicheClientActions } from '../informations/fiche-client.actions';
import { FicheClientFacade } from '../informations/fiche-client.facade';
import { FicheClientPanels } from '../informations/fiche-client.panels';
import { FicheClientStore } from '../informations/fiche-client.store';
import { CollectionFormCard } from '../collection-form-card/collection-form-card';
import { FollowParentToggle } from '../follow-parent-toggle/follow-parent-toggle';
import { ParentBanner } from '../parent-banner/parent-banner';
import { SubAccountsCard } from '../sub-accounts-card/sub-accounts-card';
import { SubAccountsHelp } from './sub-accounts-help';

/** Une ligne du rappel : un aspect, son état, et l'onglet où se trouve sa case. */
export interface FollowReminder {
  readonly aspect: CompanyFollowAspect;
  readonly label: string;
  /** « depuis le … », ou `null` : non suivi. */
  readonly since: string | null;
  readonly tab: string;
  readonly tabLabel: string;
}

/**
 * Où vit la case « Suivre le compte principal » de chaque aspect (2026-10-05) :
 * la facturation sur CET onglet (c'est elle qui fait un site), le tarif dans
 * Tarifs, les contacts en tête de la carte Contacts d'Informations.
 */
const ASPECT_TABS: Readonly<Record<CompanyFollowAspect, { tab: string; tabLabel: string }>> = {
  billing: { tab: 'sous-comptes', tabLabel: 'ci-dessus' },
  pricing: { tab: 'tarifs', tabLabel: 'Tarifs' },
  contacts: { tab: 'informations', tabLabel: 'Informations' },
};

const ASPECTS: readonly CompanyFollowAspect[] = ['billing', 'pricing', 'contacts'];

/** Le rappel en lecture des trois aspects, suivis ou non. */
export function followReminders(follows: readonly FollowedAspectView[]): readonly FollowReminder[] {
  return ASPECTS.map((aspect) => {
    const follow = follows.find((candidate) => candidate.aspect === aspect);
    return {
      aspect,
      label: FOLLOW_ASPECT_LABELS[aspect],
      since: follow === undefined ? null : formatOrderDate(follow.since),
      ...ASPECT_TABS[aspect],
    };
  });
}

/** Le compte suit-il la facturation de son principal — est-ce un site ? */
export function followsBilling(follows: readonly FollowedAspectView[]): boolean {
  return follows.some((follow) => follow.aspect === 'billing');
}

/**
 * **L'onglet Sous-comptes** de la fiche (`plan-sous-comptes.md` §4) — sorti
 * d'Informations, où S2 l'avait posé, pour que la hiérarchie se lise d'un bloc.
 *
 * Sur un principal (ou un client seul) : ses sous-comptes, « Créer », « Rattacher »
 * et la case « Compte de groupe, sans livraison ». Sur un sous-compte : le
 * bandeau « Site de / Entité rattachée à » avec « Détacher », et un rappel des
 * aspects suivis. Les cases « Suivre le compte principal » restent dans les
 * onglets qu'elles règlent : on renvoie vers elles, on ne les duplique pas.
 */
@Component({
  selector: 'app-client-sub-accounts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    CollectionFormCard,
    FollowParentToggle,
    ParentBanner,
    SubAccountsCard,
    SubAccountsHelp,
  ],
  providers: [FicheClientFacade, FicheClientStore, FicheClientPanels, FicheClientActions],
  templateUrl: './sub-accounts-page.html',
  styleUrl: './sub-accounts-page.scss',
})
export class ClientSubAccountsPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly fiche = inject(FicheClientFacade);

  protected readonly reminders = followReminders;
  protected readonly followsBilling = followsBilling;

  constructor() {
    void this.fiche.start(this.route.snapshot.paramMap.get('id'));
  }
}
