import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { vitrineContents, type VitrineContent, type VitrineSubscriberView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import {
  VITRINE_CONTENT_HINTS,
  VITRINE_CONTENT_LABELS,
  VITRINE_STATE_LABELS,
  VITRINE_STATE_VARIANTS,
  vitrineEndpointLabel,
} from '../vitrine-webhook-format';

/** Ce qu'une carte demande à la page ; la page fait l'appel et recharge. */
export type VitrineSubscriberGesture =
  | { readonly kind: 'edit' }
  | { readonly kind: 'contents'; readonly contents: readonly VitrineContent[] }
  | { readonly kind: 'active'; readonly active: boolean }
  | { readonly kind: 'test' }
  | { readonly kind: 'rotate' }
  | { readonly kind: 'journal' }
  | { readonly kind: 'resync' };

/**
 * **Un abonné** : son adresse, sa description et son contact, son état, ses cases et ses gestes. Elle
 * n'appelle rien : elle émet le geste, la page l'exécute — un seul endroit
 * pour l'attente et le refus.
 */
@Component({
  selector: 'app-vitrine-subscriber-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './vitrine-subscriber-card.html',
  styleUrl: './vitrine-subscriber-card.scss',
})
export class VitrineSubscriberCard {
  readonly subscriber = input.required<VitrineSubscriberView>();
  readonly canWrite = input(false);
  readonly busy = input(false);
  readonly gesture = output<VitrineSubscriberGesture>();

  protected readonly contentChoices = vitrineContents;
  protected readonly labels = VITRINE_CONTENT_LABELS;
  protected readonly hints = VITRINE_CONTENT_HINTS;
  protected readonly stateLabels = VITRINE_STATE_LABELS;
  protected readonly stateVariants = VITRINE_STATE_VARIANTS;
  protected readonly endpointLabel = vitrineEndpointLabel;

  protected receives(content: VitrineContent): boolean {
    return this.subscriber().contents.includes(content);
  }

  protected toggle(content: VitrineContent, checked: boolean): void {
    const current = new Set(this.subscriber().contents);
    if (checked) current.add(content);
    else current.delete(content);
    this.gesture.emit({
      kind: 'contents',
      contents: vitrineContents.filter((choice) => current.has(choice)),
    });
  }
}
