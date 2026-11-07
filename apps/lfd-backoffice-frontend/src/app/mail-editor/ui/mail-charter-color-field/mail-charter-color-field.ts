import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isHexColor, type MailCharterViolation } from '@lfd/mail-blocks';
import { FoldCalloutComponent, FoldFieldsetComponent, FoldInputComponent } from 'fold-ng';

/**
 * **Une couleur de la charte** (§ 25, C2) : la pastille, le sélecteur de
 * couleur et la valeur hexadécimale, puis les refus de ce réglage tels que
 * `validate-charter` les dit. Présentation seule : la page tient la charte.
 *
 * fold n'a pas de sélecteur de couleur (`fold-ng.d.ts` relu le 2026-11-07 :
 * `FoldInputComponent.type` n'admet pas `color`) : le natif, encadré par le
 * fieldset fold, comme `site-color-fields`.
 */
@Component({
  selector: 'app-mail-charter-color-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldFieldsetComponent, FoldInputComponent],
  templateUrl: './mail-charter-color-field.html',
  styleUrl: './mail-charter-color-field.scss',
})
export class MailCharterColorField {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly violations = input<readonly MailCharterViolation[]>([]);
  readonly readOnly = input(false);
  readonly valueChange = output<string>();

  /** La couleur à peindre et à donner au sélecteur : seulement une couleur bien formée. */
  protected readonly swatch = computed(() => {
    const value = this.value().trim().toLowerCase();
    return isHexColor(value) ? value : null;
  });

  protected change(value: string): void {
    this.valueChange.emit(value.trim().toLowerCase());
  }
}
