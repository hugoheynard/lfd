import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { ContentLocale, LegalDocumentHeading } from '@lfd/contracts';
import { contentLocales } from '@lfd/contracts/content-values';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

/** Les trois langues en segments — le libellé court, la valeur canonique. */
const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = contentLocales.map((code) => ({
  value: code,
  label: code.toUpperCase(),
}));

function sameHeading(a: LegalDocumentHeading, b: LegalDocumentHeading): boolean {
  return contentLocales.every((code) => a[code] === b[code]);
}

/**
 * **Le titre du document**, et le sélecteur de la langue affichée pour tout
 * l'écran.
 *
 * La saisie vit ici, par-dessus le titre enregistré : une relecture (après un
 * refus pour révision périmée) change l'enregistré sans effacer ce qui est en
 * cours. Elle ne s'efface que quand l'enregistré la rejoint.
 */
@Component({
  selector: 'app-legal-title-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './legal-title-card.html',
  styleUrl: './legal-title-card.scss',
})
export class LegalTitleCard {
  readonly saved = input.required<LegalDocumentHeading>();
  readonly locale = input.required<ContentLocale>();
  readonly busy = input(false);

  readonly localeChange = output<string>();
  readonly submitted = output<LegalDocumentHeading>();

  protected readonly localeOptions = LOCALE_OPTIONS;

  private readonly edited = signal<LegalDocumentHeading | null>(null);

  protected readonly draft = computed(() => this.edited() ?? this.saved());

  protected readonly changed = computed(() => !sameHeading(this.draft(), this.saved()));

  protected readonly complete = computed(() =>
    contentLocales.every((code) => this.draft()[code].trim().length > 0),
  );

  constructor() {
    effect(() => {
      const saved = this.saved();
      untracked(() => {
        const edited = this.edited();
        if (edited !== null && sameHeading(edited, saved)) {
          this.edited.set(null);
        }
      });
    });
  }

  protected set(value: string): void {
    this.edited.set({ ...this.draft(), [this.locale()]: value });
  }
}
