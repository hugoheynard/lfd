import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  companyDisplayName,
  type CounterCustomerCard,
  type OrderDraftSummaryView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { copyLink } from '../../comptabilite/copy-link';
import {
  COUNTER_ORDER_PICKER_LINK,
  counterPlacedOrderOf,
} from '../../commandes/nouvelle-commande/order-entry-origin';
import { OrderDraftsService } from '../../commandes/order-drafts.service';
import { NotifyService } from '../../notify.service';
import { CounterCustomersService } from '../counter-customers.service';
import { CounterDeliveryNoteService } from '../counter-delivery-note.service';
import { matchesCounterSearch } from '../counter-customer-search';
import { draftBadgeLabel } from './draft-badge-label';

type LoadState = 'loading' | 'ready' | 'error';

/** Un compte tel que la liste le montre : son nom lisible et ce qui le distingue. */
interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  /** « Brouillon · 14 h 32 » quand une saisie attend pour ce compte, sinon `null`. */
  readonly draft: string | null;
}

/**
 * **Nouvelle commande pro, depuis le comptoir** — trouver le compte, puis
 * passer la main à l'écran de saisie du Commercial.
 *
 * Cette page ne saisit rien. Elle n'existe que parce que le comptoir n'a pas de
 * fiche client ouverte : il faut d'abord savoir POUR QUI on commande. Ensuite,
 * c'est `comptes-clients/:id/nouvelle-commande`, inchangé — une seconde saisie
 * divergerait au premier changement de règle.
 *
 * Seuls les comptes **actifs** sont proposés — c'est le serveur qui filtre
 * (`GET /admin/counter/customers`) : c'est le statut qui fait d'une société une
 * clientèle pro. La liste se lit sous `b2b_counter:read`, jamais sous
 * `b2b_companies` : le vendeur de comptoir n'a pas la fiche client.
 *
 * Elle est aussi le RETOUR de la saisie : la commande passée revient ici avec
 * son numéro et son lien de règlement, affiché en clair parce que le client
 * est en face — le presse-papiers seul ne se montre pas.
 *
 * La recherche porte sur les champs de la carte (`matchesCounterSearch`) :
 * raison sociale, enseigne, référence, SIRET — pas le propriétaire, que la
 * carte du comptoir ne porte pas.
 */
@Component({
  selector: 'app-nouvelle-commande-pro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
  ],
  templateUrl: './nouvelle-commande-pro-page.html',
  styleUrl: './nouvelle-commande-pro-page.scss',
})
export class NouvelleCommandeProPage {
  private readonly customers = inject(CounterCustomersService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly notes = inject(CounterDeliveryNoteService);
  private readonly drafts = inject(OrderDraftsService);
  /** Le bon se réimprime-t-il en ce moment ? */
  protected readonly printing = signal(false);

  /**
   * La commande qu'on vient de passer, transmise par l'état de navigation de la
   * saisie. Lue une fois, à l'arrivée : elle concerne le client qui est encore
   * là, pas le suivant.
   */
  protected readonly placed = signal(
    counterPlacedOrderOf(this.router.currentNavigation()?.extras.state),
  );

  protected readonly state = signal<LoadState>('loading');
  private readonly active = signal<readonly CounterCustomerCard[]>([]);
  protected readonly query = signal('');
  /** Le libellé de pastille de chaque compte qui a un brouillon. */
  private readonly draftLabels = signal<ReadonlyMap<string, string>>(new Map());

  /** Aucun compte pro du tout — distinct d'une recherche qui ne trouve rien. */
  protected readonly noActiveCompany = computed(() => this.active().length === 0);

  protected readonly rows = computed<readonly CompanyRow[]>(() =>
    this.active()
      .filter((card) => matchesCounterSearch(card, this.query()))
      .map((card) => ({
        id: card.id,
        name: companyDisplayName({ raisonSociale: card.name, enseigne: card.tradeName }),
        detail: `${card.reference} · SIRET ${card.siret}`,
        draft: this.draftLabels().get(card.id) ?? null,
      })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    // En parallèle de la liste, et sans jamais la retenir.
    void this.loadDrafts();
    try {
      // Le serveur ne rend que les sociétés actives : aucun filtre à refaire ici.
      this.active.set(await this.customers.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Les brouillons en attente, pour la pastille. Un échec — 403 compris — se
   * tait : sans pastille, la page reste le sélecteur qu'elle était.
   */
  private async loadDrafts(): Promise<void> {
    try {
      const summaries: readonly OrderDraftSummaryView[] = await this.drafts.list();
      const now = new Date();
      this.draftLabels.set(
        new Map(summaries.map((draft) => [draft.companyId, draftBadgeLabel(draft.savedAt, now)])),
      );
    } catch {
      this.draftLabels.set(new Map());
    }
  }

  protected onSearchChange(query: string): void {
    this.query.set(query);
  }

  protected choose(companyId: string): void {
    void this.router.navigate([COUNTER_ORDER_PICKER_LINK, companyId]);
  }

  protected copy(url: string): void {
    void copyLink(url, this.notify);
  }

  /**
   * Réimprime le bon de livraison de transport d'un retrait immédiat remis
   * (lot L6 ; non chiffré depuis le 2026-11-03) — la
   * saisie l'a ouvert une fois ; un onglet bloqué ou fermé ne doit pas le
   * perdre.
   */
  protected async printNote(orderId: string): Promise<void> {
    this.printing.set(true);
    try {
      await this.notes.openCarrier(orderId);
    } catch (error) {
      this.notify.error(error, 'Le bon n’a pas pu s’ouvrir.');
    } finally {
      this.printing.set(false);
    }
  }

  /** Le client suivant : on range le récapitulatif du précédent. */
  protected dismissPlaced(): void {
    this.placed.set(null);
  }
}
