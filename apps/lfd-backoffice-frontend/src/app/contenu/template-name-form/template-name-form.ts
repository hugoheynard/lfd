import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldInputComponent, FoldTextareaComponent } from 'fold-ng';

import {
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  type TemplateLabel,
} from '../storefront-templates';

/**
 * Le nom et la description (facultative) d'un gabarit, à la création comme
 * au renommage. Il ne juge pas : l'unicité dépend de la liste, que le parent tient — il émet, le
 * parent refuse ou accepte (et ferme).
 */
@Component({
  selector: 'app-template-name-form',
  imports: [FoldButtonComponent, FoldInputComponent, FoldTextareaComponent],
  templateUrl: './template-name-form.html',
  styleUrl: './template-name-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateNameForm {
  readonly initial = input('');
  readonly initialDescription = input('');
  readonly submitLabel = input('Enregistrer');
  readonly submitted = output<TemplateLabel>();
  readonly cancelled = output();

  protected readonly max = TEMPLATE_NAME_MAX;
  protected readonly descriptionMax = TEMPLATE_DESCRIPTION_MAX;
  protected readonly draft = signal<string | null>(null);
  protected readonly descriptionDraft = signal<string | null>(null);

  protected value(): string {
    return this.draft() ?? this.initial();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.submitted.emit({ name: this.value(), description: this.description() });
  }

  protected description(): string {
    return this.descriptionDraft() ?? this.initialDescription();
  }
}
