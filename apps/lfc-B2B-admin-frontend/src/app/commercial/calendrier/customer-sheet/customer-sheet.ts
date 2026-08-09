import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';
import type { CompanyStatusAction, CustomerSheetView } from '@lfd/contracts';

import { NotifyService } from '../../../notify.service';
import { CustomerSheetService } from './customer-sheet.service';
import { euros, membershipAge, trendLabel, trendTone } from './customer-format';

/** Les libellés d'état, tels que le commercial les lit. */
const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  active: 'Actif',
  suspended: 'Suspendu',
  terminated: 'Résilié',
};

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'alert'> = {
  pending: 'neutral',
  active: 'success',
  suspended: 'warning',
  terminated: 'alert',
};

/**
 * **Fiche client, version commerciale** — ce qu'on a sous les yeux en décrochant.
 *
 * Trois cartes, dans l'ordre où on s'en sert : **qui** est en face (établissement,
 * catégorie, ancienneté, contact), **combien** il pèse (quatre chiffres, dont
 * l'évolution des 30 derniers jours), et **quoi** il a commandé. Les actions qui
 * engagent — suspendre, résilier — sont en bas, derrière une confirmation en
 * ligne : ce ne sont pas des gestes qu'on fait en passant.
 *
 * Le composant ne connaît qu'un `companyId` : c'est lui qui charge, pour que le
 * panneau qui l'héberge n'ait pas à savoir ce qu'est une fiche.
 */
@Component({
  selector: 'app-customer-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './customer-sheet.html',
  styleUrl: './customer-sheet.scss',
})
export class CustomerSheet {
  private readonly service = inject(CustomerSheetService);
  private readonly notify = inject(NotifyService);

  readonly companyId = input.required<string>();

  protected readonly sheet = signal<CustomerSheetView | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);

  /** Posé une fois : une fiche ne doit pas changer d'ancienneté pendant qu'on la lit. */
  private readonly now = new Date();

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.sheet()?.status ?? ''] ?? '—');
  protected readonly statusTone = computed(
    () => STATUS_TONE[this.sheet()?.status ?? ''] ?? 'neutral',
  );

  /** L'établissement : l'enseigne si elle existe, la raison sociale sinon. */
  protected readonly displayName = computed(() => {
    const sheet = this.sheet();
    if (sheet === null) {
      return '';
    }
    return sheet.enseigne === '' ? sheet.raisonSociale : sheet.enseigne;
  });

  protected readonly age = computed(() => {
    const sheet = this.sheet();
    return sheet === null ? '' : membershipAge(sheet.createdAt, this.now);
  });

  protected readonly trend = computed(() => {
    const sheet = this.sheet();
    return sheet === null
      ? null
      : { label: trendLabel(sheet.stats.trend), tone: trendTone(sheet.stats.trend) };
  });

  /** Un compte actif se suspend ; un suspendu se réactive ; un résilié ne bouge plus. */
  protected readonly canSuspend = computed(() => this.sheet()?.status === 'active');
  protected readonly canReactivate = computed(() => this.sheet()?.status === 'suspended');
  protected readonly canTerminate = computed(
    () => this.sheet()?.status === 'active' || this.sheet()?.status === 'suspended',
  );

  constructor() {
    effect(() => {
      void this.load(this.companyId());
    });
  }

  protected euros(cents: number): string {
    return euros(cents);
  }

  protected async load(companyId: string): Promise<void> {
    this.failed.set(false);
    try {
      this.sheet.set(await this.service.sheet(companyId));
    } catch {
      // Un échec de chargement reste À L'ÉCRAN : il n'y a rien à montrer, et le
      // « Réessayer » doit rester atteignable.
      this.failed.set(true);
    }
  }

  /** Suspend, réactive ou résilie — et relit la fiche pour afficher l'état réel. */
  protected async changeStatus(action: CompanyStatusAction, reason: string): Promise<void> {
    const companyId = this.companyId();
    this.busy.set(true);
    try {
      await this.service.changeStatus(companyId, { action, reason });
      await this.load(companyId);
      this.notify.success(DONE_LABEL[action]);
    } catch (error) {
      this.notify.error(error, "L'état du compte n'a pas pu être changé.");
    } finally {
      this.busy.set(false);
    }
  }
}

/** Ce qu'on confirme au commercial, une fois le geste passé. */
const DONE_LABEL: Record<CompanyStatusAction, string> = {
  suspend: 'Compte suspendu.',
  reactivate: 'Compte réactivé.',
  terminate: 'Compte résilié.',
};
