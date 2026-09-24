import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { describeFormat } from '@lfd/storefront-layout';

import type { StorefrontTemplate, TemplateLabel } from '../storefront-templates';
import { TemplateNameForm } from '../template-name-form/template-name-form';

/**
 * La section « Gabarits » de la palette : chacun se glisse ou se pose comme
 * une forme, se renomme (nom et description) et se supprime (après confirmation).
 *
 * Le renommage passe par `rename`, que le parent fournit : c'est lui qui tient
 * la liste, donc lui qui juge l'unicité — et qui dit si le champ peut se fermer.
 */
@Component({
  selector: 'app-storefront-template-list',
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    TemplateNameForm,
  ],
  templateUrl: './storefront-template-list.html',
  styleUrl: './storefront-template-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontTemplateList {
  readonly templates = input.required<readonly StorefrontTemplate[]>();
  readonly rename = input.required<(id: string, label: TemplateLabel) => boolean>();
  readonly pressed = output<{
    readonly event: PointerEvent;
    readonly template: StorefrontTemplate;
  }>();
  readonly added = output<StorefrontTemplate>();
  readonly deleted = output<string>();

  protected readonly describe = describeFormat;
  protected readonly editingId = signal<string | null>(null);

  protected submitRename(id: string, label: TemplateLabel): void {
    if (this.rename()(id, label)) {
      this.editingId.set(null);
    }
  }
}
