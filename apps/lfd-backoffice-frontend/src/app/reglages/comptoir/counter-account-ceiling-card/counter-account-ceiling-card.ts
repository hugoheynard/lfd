import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CounterAccountCeilingView } from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CounterAccountCeilingService } from '../counter-account-ceiling.service';

type LoadState = 'loading' | 'ready' | 'error';

const CENTS_PER_EURO = 100;

const MODIFIED_AT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/**
 * **Le plafond des comptes ouverts au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.3) : au-delà, une commande au compte d'un compte du comptoir est refusée
 * tant qu'il n'est pas converti. Vide = aucun plafond, le défaut. Saisi en
 * euros, envoyé en centimes. Sous `lfc_order_settings`, figé sans `:write`.
 */
@Component({
  selector: 'app-counter-account-ceiling-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './counter-account-ceiling-card.html',
  styleUrl: './counter-account-ceiling-card.scss',
})
export class CounterAccountCeilingCard {
  private readonly service = inject(CounterAccountCeilingService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<CounterAccountCeilingView | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** Le montant saisi en euros ; `undefined` tant qu'on n'a pas touché au champ. */
  protected readonly draft = signal<number | null | undefined>(undefined);

  /** Le plafond servi, en euros ; `null` = aucun. */
  private readonly servedEuros = computed(() => {
    const cents = this.view()?.ceilingCents ?? null;
    return cents === null ? null : cents / CENTS_PER_EURO;
  });
  protected readonly euros = computed(() => {
    const draft = this.draft();
    return draft === undefined ? this.servedEuros() : draft;
  });
  protected readonly isValid = computed(() => {
    const value = this.euros();
    return value === null || value >= 0;
  });
  protected readonly canSave = computed(
    () => this.isValid() && this.euros() !== this.servedEuros() && !this.pending(),
  );

  /** « Plafond : 500,00 € » ou « Aucun plafond ». */
  protected readonly current = computed(() => {
    const cents = this.view()?.ceilingCents ?? null;
    return cents === null ? 'Aucun plafond' : `Plafond : ${formatCents(cents)}`;
  });

  /** « Modifié par X, le … », ou le défaut d'un réglage jamais posé. */
  protected readonly lastChange = computed(() => {
    const view = this.view();
    if (view === null || view.updatedAt === null) {
      return 'Jamais réglé : aucun plafond par défaut.';
    }
    const when = MODIFIED_AT.format(new Date(view.updatedAt));
    return view.updatedByName === null
      ? `Modifié le ${when}.`
      : `Modifié par ${view.updatedByName}, le ${when}.`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Enregistre le plafond, puis relit. Un refus laisse le plafond servi, avec la raison. */
  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const euros = this.euros();
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.set({
        ceilingCents: euros === null ? null : Math.round(euros * CENTS_PER_EURO),
      });
      this.view.set(await this.service.read());
      this.draft.set(undefined);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le plafond n'a pas pu être enregistré."));
    } finally {
      this.pending.set(false);
    }
  }
}
