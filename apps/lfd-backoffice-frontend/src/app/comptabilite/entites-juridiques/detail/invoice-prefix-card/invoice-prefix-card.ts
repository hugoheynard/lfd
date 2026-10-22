import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { LegalEntitiesService } from '../../../legal-entities.service';

/**
 * **La numérotation des factures** : le préfixe de l'entité, le `LFD` de
 * `FA-LFD-2026-000001` (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, F14, lot ZA).
 *
 * ## Libre, puis figé
 *
 * Il se pose et se corrige tant que l'entité n'a rien émis ; dès la première
 * pièce, il est figé (agrégat et base) — la carte ne propose alors plus de
 * le changer, et le dit. La forme (2 à 6 lettres) et l'unicité sont jugées par
 * le serveur : la carte guide, elle ne revalide pas.
 */
@Component({
  selector: 'app-invoice-prefix-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldBadgeComponent,
  ],
  templateUrl: './invoice-prefix-card.html',
  styleUrl: './invoice-prefix-card.scss',
})
export class InvoicePrefixCard {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly hint = '2 à 6 lettres majuscules, unique, figé dès la première facture émise.';

  protected readonly draft = signal('');

  /** Le numéro tel qu'il s'imprimera, avec ce qui est tapé — en majuscules, comme le serveur. */
  protected readonly preview = computed(() => {
    const typed = this.draft().trim().toUpperCase();
    return typed === '' ? null : numberOf(typed);
  });

  protected readonly current = computed(() => {
    const prefix = this.entity().invoicePrefix;
    return prefix === null ? null : numberOf(prefix);
  });

  constructor() {
    effect(() => {
      this.draft.set(this.entity().invoicePrefix ?? '');
    });
  }

  protected save(): void {
    const prefix = this.draft().trim();
    if (prefix === '') {
      return;
    }
    const id = this.entity().id;
    this.saved.emit({
      action: () => this.api.setInvoicePrefix(id, { prefix }),
      said: 'Préfixe de numéro enregistré.',
    });
  }
}

/** `FA-<préfixe>-AAAA-000001` : l'année n'est pas celle de l'écran, c'est celle de chaque pièce. */
function numberOf(prefix: string): string {
  return `FA-${prefix}-AAAA-000001`;
}
