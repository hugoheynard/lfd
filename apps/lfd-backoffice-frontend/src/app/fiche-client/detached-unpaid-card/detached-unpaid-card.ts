import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DetachedUnpaidOrderView } from '@lfd/contracts';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { DetachedUnpaidService } from '../facturation/detached-unpaid.service';

/**
 * **« Commandes restant à régler »** — les commandes d'un site détaché que le
 * prélèvement a écartées (`plan-sous-comptes.md` §2.1 quater). Le principal
 * n'est jamais débité d'office : la carte les signale pour qu'on les règle par
 * lien de paiement ou à la main.
 *
 * Posée sur la fiche du site ET sur celle du principal : le serveur rend l'une
 * ou l'autre vue selon `companyId`. Rien à dire quand la liste est vide — la
 * carte ne s'affiche pas ; un échec de lecture, lui, se dit, sans masquer le
 * reste de la page.
 */
@Component({
  selector: 'app-detached-unpaid-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './detached-unpaid-card.html',
  styleUrl: './detached-unpaid-card.scss',
})
export class DetachedUnpaidCard {
  readonly companyId = input.required<string>();

  private readonly service = inject(DetachedUnpaidService);

  protected readonly orders = signal<readonly DetachedUnpaidOrderView[]>([]);
  protected readonly loadError = signal(false);

  protected readonly totalCents = computed(() =>
    this.orders().reduce((sum, order) => sum + order.totalCents, 0),
  );

  protected readonly euros = formatCents;
  protected readonly day = formatOrderDate;

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.load(id));
    });
  }

  protected retry(): void {
    void this.load(this.companyId());
  }

  private async load(companyId: string): Promise<void> {
    this.loadError.set(false);
    try {
      const view = await this.service.ofCompany(companyId);
      this.orders.set(view.orders);
    } catch {
      // Rien n'est appliqué : la liste garde ce qu'elle avait.
      this.loadError.set(true);
    }
  }
}
