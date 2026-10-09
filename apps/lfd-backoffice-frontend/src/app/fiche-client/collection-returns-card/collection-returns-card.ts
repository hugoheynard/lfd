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
import type { CollectionReturnView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import {
  returnAmount,
  returnBadge,
  returnSentence,
} from '../../comptabilite/collection-return-wording';
import { CollectionReturnsService } from '../../comptabilite/collection-returns.service';

/**
 * **« Prélèvement rejeté le … (motif) »** — les retours bancaires dont la
 * ligne débitait cette société (plan `plan-retours-bancaires.md`, § 5). La
 * fiche est celle du PAYEUR : un site qui suit son principal n'en a pas.
 *
 * Pas de blocage automatique (A36) : la carte le dit, le staff décide — par
 * l'outil de blocage existant s'il le faut. Rien à dire quand il n'y a aucun
 * retour, ni pour qui n'a pas la lecture comptable : la carte ne s'affiche pas.
 */
@Component({
  selector: 'app-collection-returns-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './collection-returns-card.html',
  styleUrl: './collection-returns-card.scss',
})
export class CollectionReturnsCard {
  readonly companyId = input.required<string>();

  private readonly service = inject(CollectionReturnsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly returns = signal<readonly CollectionReturnView[]>([]);
  protected readonly loadError = signal(false);

  protected readonly pending = computed(() =>
    this.returns().filter((item) => item.resolution === 'pending'),
  );

  protected readonly sentence = returnSentence;
  protected readonly amount = returnAmount;
  protected readonly badge = returnBadge;

  constructor() {
    effect(() => {
      const id = this.companyId();
      if (this.permissions.can('b2b_accounting:read')) {
        untracked(() => void this.load(id));
      }
    });
  }

  protected retry(): void {
    void this.load(this.companyId());
  }

  private async load(companyId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.returns.set(await this.service.ofPayer(companyId));
    } catch {
      // Rien n'est appliqué : la liste garde ce qu'elle avait.
      this.loadError.set(true);
    }
  }
}
