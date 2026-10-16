import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { CommerceOperationView } from '@lfd/contracts';
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
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { formatInstant, pickupPhrase } from '../../pim/operations/operation-schedule';
import {
  audienceLabel,
  badgeLabel,
  badgeOf,
  badgeVariant,
  isNotAtCommerce,
  shopDisplayPhrase,
  splitArchived,
} from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { OperationImage } from '../operation-image/operation-image';
import { OperationsMigrationCard } from '../operations-migration-card/operations-migration-card';

/** `closed` : l'interrupteur `OPERATIONS_AT_COMMERCE` est fermé — un état, pas une panne. */
type LoadState = 'loading' | 'error' | 'closed' | 'ready';

/**
 * **Les opérations, tenues au commerce** — Noël, Pâques, la galette : où
 * chacune en est, et ce que le client en voit
 * (`plan-l-operation-passe-au-commerce.md`, lot 3).
 *
 * La reprise depuis le référentiel n'est offerte qu'à `lfc_operations:write` ;
 * son aperçu se lit interrupteur fermé, c'est lui qu'on relit avant d'ouvrir.
 */
@Component({
  selector: 'app-commerce-operations-page',
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
    NgTemplateOutlet,
    OperationImage,
    OperationsMigrationCard,
    RouterLink,
  ],
  templateUrl: './commerce-operations-page.html',
  styleUrl: './commerce-operations-page.scss',
})
export class CommerceOperationsPage {
  private readonly api = inject(CommerceOperationsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<LoadState>('loading');
  private readonly operations = signal<readonly CommerceOperationView[]>([]);
  private readonly split = computed(() => splitArchived(this.operations()));
  protected readonly live = computed(() => this.split().live);
  protected readonly archived = computed(() => this.split().archived);

  /** La reprise écrit : elle n'est montrée qu'à qui peut l'appliquer. */
  protected readonly canMigrate = computed(() => this.permissions.can('lfc_operations:write'));

  protected readonly badgeLabel = (view: CommerceOperationView): string =>
    badgeLabel(badgeOf(view));
  protected readonly badgeVariant = (view: CommerceOperationView) => badgeVariant(badgeOf(view));
  protected readonly shopDisplay = (view: CommerceOperationView): string =>
    shopDisplayPhrase(view.shopDisplay);
  protected readonly audience = (view: CommerceOperationView): string =>
    audienceLabel(view.audience);
  protected readonly announce = (view: CommerceOperationView): string =>
    formatInstant(view.announceFrom);
  protected readonly until = (view: CommerceOperationView): string =>
    formatInstant(view.orderUntil);
  protected readonly pickup = (view: CommerceOperationView): string =>
    pickupPhrase(view.pickupFrom, view.pickupUntil);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.operations.set(await this.api.list());
      this.state.set('ready');
    } catch (error: unknown) {
      this.state.set(isNotAtCommerce(error) ? 'closed' : 'error');
    }
  }
}
