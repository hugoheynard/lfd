import { computed, inject, signal, type WritableSignal } from '@angular/core';
import type { MyDeliveryRoundSummaryView, MyDeliveryRoundView } from '@lfd/contracts';

import { MyDeliveryRoundService } from './my-delivery-round.service';
import { parisDayOf } from './run-sheet';

export type MyRoundListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rounds: readonly MyDeliveryRoundSummaryView[] };

export type MyRoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly round: MyDeliveryRoundView };

/**
 * Ce que « Ma tournée » lit : les tournées du jour, celle qu'on a choisie, et
 * leur relecture quand la version bouge (PL4).
 *
 * Sorti de `MyRoundPage` pour que la page ne garde que les gestes du livreur ;
 * elle en ré-expose les signaux sous leurs noms, si bien que le gabarit ne
 * change pas. Construit dans le contexte d'injection de la page (initialiseur
 * de champ), ce qui l'autorise à appeler `inject()`. Le refus affiché reste à
 * la page : changer de tournée l'efface, d'où le signal reçu.
 */
export class MyRoundReader {
  private readonly service = inject(MyDeliveryRoundService);

  readonly today = parisDayOf(new Date());

  readonly list = signal<MyRoundListState>({ status: 'loading' });
  readonly selected = signal<string | null>(null);
  readonly detail = signal<MyRoundState>({ status: 'loading' });

  readonly round = computed(() => {
    const detail = this.detail();
    return detail.status === 'ready' ? detail.round : null;
  });

  constructor(private readonly refusal: WritableSignal<string | null>) {}

  open(roundId: string): void {
    this.selected.set(roundId);
    this.refusal.set(null);
    void this.loadRound(roundId);
  }

  back(): void {
    this.selected.set(null);
    this.refusal.set(null);
  }

  retryList(): void {
    void this.loadList();
  }

  retryRound(): void {
    const id = this.selected();
    if (id !== null) {
      void this.loadRound(id);
    }
  }

  /**
   * La version a bougé : relire ce qui est à l'écran, sans repasser par
   * « chargement » ni rouvrir d'office — le livreur garde sa place. Ne rejette
   * pas : un échec garde l'écran d'avant, le tick suivant réessaiera.
   */
  async refresh(): Promise<void> {
    const id = this.selected();
    if (id !== null) {
      await this.loadRound(id);
      return;
    }
    if (this.list().status !== 'ready') {
      return;
    }
    try {
      const { rounds } = await this.service.mine(this.today);
      if (this.selected() === null) {
        this.list.set({ status: 'ready', rounds });
      }
    } catch {
      // L'écran d'avant reste : le tick suivant reposera la question.
    }
  }

  async loadList(): Promise<void> {
    this.list.set({ status: 'loading' });
    try {
      const { rounds } = await this.service.mine(this.today);
      this.list.set({ status: 'ready', rounds });
      const [only] = rounds;
      if (rounds.length === 1 && only !== undefined) {
        this.open(only.id);
      }
    } catch {
      this.list.set({ status: 'error' });
    }
  }

  async loadRound(roundId: string): Promise<void> {
    // Une relecture de la même tournée la garde à l'écran.
    const current = this.detail();
    if (current.status !== 'ready' || current.round.id !== roundId) {
      this.detail.set({ status: 'loading' });
    }
    try {
      const round = await this.service.round(roundId);
      if (this.selected() === roundId) {
        this.detail.set({ status: 'ready', round });
      }
    } catch {
      if (this.selected() === roundId) {
        this.detail.set({ status: 'error' });
      }
    }
  }
}
