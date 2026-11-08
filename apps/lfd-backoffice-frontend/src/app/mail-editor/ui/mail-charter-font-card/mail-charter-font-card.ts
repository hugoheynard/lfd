import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { MailCharterFont, MailCharterViolation } from '@lfd/mail-blocks';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
} from 'fold-ng';

import type { CharterFontSlot } from '../../rules/mail-charter-edits';

const EMPTY_FONT: MailCharterFont = { family: '', url: '', fallback: '' };

/**
 * **Une police de la charte** (§ 25, C2) — celle des titres ou celle du
 * texte (2026-11-08) : la case « une police web », puis le nom, l'adresse
 * du fichier et la police de secours, chacun avec ses refus tels que
 * `validate-charter` les dit. Présentation seule : la page tient la charte.
 */
@Component({
  selector: 'app-mail-charter-font-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
  ],
  templateUrl: './mail-charter-font-card.html',
  styleUrl: './mail-charter-font-card.scss',
})
export class MailCharterFontCard {
  readonly slot = input.required<CharterFontSlot>();
  readonly heading = input.required<string>();
  readonly subtitle = input('');
  readonly toggleLabel = input.required<string>();
  readonly fallbackPlaceholder = input('');
  readonly font = input.required<MailCharterFont | null>();
  /** Tous les refus de la charte : la carte ne montre que ceux de sa police. */
  readonly violations = input<readonly MailCharterViolation[]>([]);
  readonly readOnly = input(false);
  readonly fontChange = output<MailCharterFont | null>();

  protected readonly issues = computed(() => {
    const prefix = `${this.slot()}.`;
    return this.violations().filter((violation) => violation.field.startsWith(prefix));
  });

  protected issuesOf(key: keyof MailCharterFont): readonly MailCharterViolation[] {
    const field = `${this.slot()}.${key}`;
    return this.issues().filter((violation) => violation.field === field);
  }

  protected toggle(on: boolean): void {
    this.fontChange.emit(on ? EMPTY_FONT : null);
  }

  protected set(key: keyof MailCharterFont, value: string): void {
    const font = this.font();
    if (font !== null) {
      this.fontChange.emit({ ...font, [key]: value });
    }
  }
}
