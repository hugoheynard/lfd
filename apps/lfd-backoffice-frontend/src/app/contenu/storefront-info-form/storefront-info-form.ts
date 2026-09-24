import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { StorefrontText } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelHostService,
  FoldTextareaComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from '../../pim/catalogue/library-picker/library-picker';
import type { ShelfOption } from '../storefront-catalog';
import {
  type InfoContent,
  optionalText,
  STOREFRONT_LOCALES,
  type StorefrontLocale,
  TEXT_LIMITS,
  textIn,
  writeText,
} from '../storefront-text';

const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = STOREFRONT_LOCALES.map((code) => ({
  value: code,
  label: code.toUpperCase(),
}));

function isLocale(value: string): value is StorefrontLocale {
  return (STOREFRONT_LOCALES as readonly string[]).includes(value);
}

/** Les textes facultatifs d'une info — ils disparaissent quand plus aucune langue n'est écrite. */
type OptionalField = 'badge' | 'lede';

/**
 * Rédiger un contenu **info** : pastille, titre, phrase, image, lien vers un
 * rayon (`boutique-rayon-layout.md`, « Le contenu s'associe ensuite »).
 *
 * Le français est obligatoire, l'anglais et l'italien facultatifs, et l'on
 * écrit une langue à la fois (le sélecteur est celui de l'« App footer »).
 * Le formulaire ne garde rien : chaque frappe rend l'info entière, que
 * l'éditeur range.
 *
 * L'image se CHOISIT dans la médiathèque, par le sélecteur des fiches. 🔴 Son
 * texte alternatif part vide : une URL n'est pas une description, et la
 * remplir ainsi ferait croire à une alternative rédigée.
 */
@Component({
  selector: 'app-storefront-info-form',
  imports: [
    FoldButtonComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './storefront-info-form.html',
  styleUrl: './storefront-info-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontInfoForm {
  private readonly panels = inject(FoldPanelHostService);

  readonly info = input.required<InfoContent>();
  readonly shelves = input.required<readonly ShelfOption[]>();
  readonly changed = output<InfoContent>();

  protected readonly limits = TEXT_LIMITS;
  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly locale = signal<StorefrontLocale>('fr');
  protected readonly textIn = textIn;

  protected readonly shelfOptions = computed(() =>
    this.shelves().map((shelf) => ({ value: shelf.key, label: shelf.label })),
  );

  /** Le français se signale obligatoire ; les autres langues, facultatives. */
  protected readonly isSource = computed(() => this.locale() === 'fr');

  protected pickLocale(value: string): void {
    if (isLocale(value)) {
      this.locale.set(value);
    }
  }

  protected setTitle(value: string): void {
    this.emit({ title: writeText(this.info().title, this.locale(), value) });
  }

  protected setOptional(field: OptionalField, value: string): void {
    this.emit({ [field]: optionalText(writeText(this.info()[field], this.locale(), value)) });
  }

  protected setAlt(value: string): void {
    const image = this.info().image;
    if (image !== null) {
      this.emit({
        image: { ...image, alt: optionalText(writeText(image.alt, this.locale(), value)) },
      });
    }
  }

  protected setLink(shelf: string | null): void {
    this.emit({ linkShelfKey: shelf });
  }

  protected removeImage(): void {
    this.emit({ image: null });
  }

  /** Une image neuve repart sans alternative : celle de l'ancienne ne la décrit pas. */
  protected chooseImage(): void {
    const current = this.info().image;
    void this.panels
      .open<LibraryPickerData, readonly PickedMedia[]>(LibraryPicker, {
        data: { already: current === null ? [] : [current.url], single: true },
      })
      .closed.then((picked) => {
        const [chosen] = picked ?? [];
        if (chosen !== undefined) {
          this.emit({ image: { url: chosen.url, alt: null } });
        }
      });
  }

  private emit(patch: Partial<Omit<InfoContent, 'kind'>>): void {
    this.changed.emit({ ...this.info(), ...patch });
  }

  /** Le libellé d'un champ, avec la langue écrite. */
  protected labelOf(label: string): string {
    return `${label} (${this.locale().toUpperCase()})`;
  }

  /** Le texte en français, sous le champ d'une autre langue : ce qu'on traduit. */
  protected sourceHint(text: StorefrontText | null, max: number): string {
    const source = textIn(text, 'fr');
    return this.isSource() || source === ''
      ? `${max} caractères au plus.`
      : `Français : « ${source} » — ${max} caractères au plus.`;
  }
}
