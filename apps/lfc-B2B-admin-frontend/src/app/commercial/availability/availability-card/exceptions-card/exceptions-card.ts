import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldSelectComponent,
} from 'fold-ng';
import type { ExceptionKind } from '@lfd/contracts';

import { addException, removeException, type AvailabilityDraft } from '../../availability-draft';

/** Bornes proposées pour une ouverture ponctuelle — la matinée ouvrée. */
const OPEN_DEFAULT = { startTime: '09:00', endTime: '12:00' };

/**
 * Carte **Fermetures et ouvertures exceptionnelles** : les écarts datés à la
 * grille hebdomadaire — congés, jour férié, samedi de salon.
 *
 * Une fermeture sans bornes ferme la journée entière ; une ouverture ponctuelle
 * en exige, on propose donc la matinée, ajustable ensuite comme n'importe quelle
 * plage.
 */
@Component({
  selector: 'app-exceptions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldDateComponent,
    FoldSelectComponent,
    FoldInputComponent,
    FoldButtonComponent,
  ],
  templateUrl: './exceptions-card.html',
  styleUrl: './exceptions-card.scss',
})
export class ExceptionsCard {
  readonly draft = input.required<AvailabilityDraft>();
  readonly changed = output<AvailabilityDraft>();

  protected readonly exceptions = computed(() => this.draft().exceptions);

  /** Le formulaire d'ajout — local à la carte, il ne touche au brouillon qu'au clic. */
  protected readonly day = signal('');
  protected readonly kind = signal<ExceptionKind>('closed');
  protected readonly reason = signal('');

  protected readonly canAdd = computed(() => /^\d{4}-\d{2}-\d{2}$/u.test(this.day()));

  protected onKind(value: string): void {
    this.kind.set(value === 'open' ? 'open' : 'closed');
  }

  protected add(): void {
    if (!this.canAdd()) {
      return;
    }
    const isOpen = this.kind() === 'open';
    this.changed.emit(
      addException(this.draft(), {
        day: this.day(),
        kind: this.kind(),
        startTime: isOpen ? OPEN_DEFAULT.startTime : null,
        endTime: isOpen ? OPEN_DEFAULT.endTime : null,
        reason: this.reason().trim(),
      }),
    );
    this.day.set('');
    this.reason.set('');
  }

  protected remove(index: number): void {
    this.changed.emit(removeException(this.draft(), index));
  }
}
