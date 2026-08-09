import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import type { CustomerSheetView } from '@lfd/contracts';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne de journal, mise en forme. */
interface JournalRow {
  readonly id: string;
  readonly type: string;
  readonly when: string;
  readonly actor: string;
}

/** Une donnée d'identité technique du compte. */
interface Fact {
  readonly label: string;
  readonly value: string;
}

const ACTOR_LABEL: Record<string, string> = {
  customer: 'le client',
  staff: 'un membre du staff',
  system: 'le système',
};

/**
 * **Données** d'un compte : ce que le système sait de lui.
 *
 * Volontairement brut — c'est la page qu'on ouvre quand un chiffre paraît faux
 * ailleurs, pour voir d'où il vient. Le **journal** y est intégral (dans la
 * limite de ce que la fiche remonte) et non filtré aux seuls événements
 * commerciaux, contrairement à l'historique du tableau de bord : ici on cherche
 * une trace, pas une lecture.
 */
@Component({
  selector: 'app-client-data-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './data-page.html',
  styleUrl: './data-page.scss',
})
export class ClientDataPage {
  readonly id = input.required<string>();

  private readonly api = inject(CustomerSheetService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly sheet = signal<CustomerSheetView | null>(null);

  /** L'identité technique — ce qu'on donne au support quand quelque chose cloche. */
  protected readonly facts = computed<readonly Fact[]>(() => {
    const view = this.sheet();
    if (view === null) {
      return [];
    }
    return [
      { label: 'Identifiant', value: view.companyId },
      { label: 'Référence', value: view.reference },
      { label: 'Code NAF', value: view.nafCode === '' ? '—' : view.nafCode },
      { label: 'Statut', value: view.status },
      { label: 'Inscription', value: isoDay(view.createdAt) },
      {
        label: 'Activation',
        value: view.activatedAt === null ? 'jamais activée' : isoDay(view.activatedAt),
      },
    ];
  });

  protected readonly journal = computed<readonly JournalRow[]>(() =>
    (this.sheet()?.timeline ?? []).map((entry) => ({
      id: entry.id,
      type: entry.type,
      when: new Date(entry.occurredAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      actor: ACTOR_LABEL[entry.actorType] ?? entry.actorType,
    })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.sheet.set(await this.api.sheet(this.id()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

/** `2026-08-09T…` → `09/08/2026`. */
function isoDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}
