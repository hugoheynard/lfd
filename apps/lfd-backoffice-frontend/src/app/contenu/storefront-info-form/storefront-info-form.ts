import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  StorefrontCatalogOperation,
  StorefrontInfoAction,
  StorefrontText,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
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
import { inheritedBadge, operationOf, operationOptionLabel } from '../storefront-operations';
import {
  type InfoContent,
  infoActionOf,
  linkedOperation,
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

const ACTION_OPTIONS: readonly (FoldViewToggleOption & { value: StorefrontInfoAction })[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'shelf', label: 'Ouvrir un rayon' },
  { value: 'operation', label: 'Ouvrir une opération' },
];

function isAction(value: string): value is StorefrontInfoAction {
  return ACTION_OPTIONS.some((option) => option.value === value);
}

/** Le texte d'une langue, le français faute de mieux — ce que la boutique affichera. */
function shownIn(text: StorefrontText | null, locale: StorefrontLocale): string {
  const written = textIn(text, locale).trim();
  return written === '' ? textIn(text, 'fr') : written;
}

/** Les textes facultatifs d'une info — ils disparaissent quand plus aucune langue n'est écrite. */
type OptionalField = 'badge' | 'lede';

/** Les champs qu'une annonce liée hérite de son opération. */
type InheritedField = 'badge' | 'title' | 'lede' | 'image';

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
 *
 * **Liée à une opération** (D11 de `architecture-operations-datees.md`),
 * l'annonce hérite : un champ vide montre en gris ce que l'opération y mettra
 * (la pastille : ce que la boutique calculera, « J‑18 »), un champ rempli
 * surcharge, et une croix le vide pour revenir à l'opération.
 */
@Component({
  selector: 'app-storefront-info-form',
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
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
  /** Les opérations reçues ; `null` : le catalogue n'a pas pu être lu. */
  readonly operations = input<readonly StorefrontCatalogOperation[] | null>(null);
  readonly changed = output<InfoContent>();

  protected readonly limits = TEXT_LIMITS;
  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly locale = signal<StorefrontLocale>('fr');
  protected readonly textIn = textIn;

  protected readonly actionOptions = ACTION_OPTIONS;
  protected readonly action = computed(() => infoActionOf(this.info()));

  /**
   * Les rayons qu'ouvre « Ouvrir un rayon » : les familles. Le rayon d'une
   * opération s'ouvre par « Ouvrir une opération », qui hérite ; il ne reste
   * proposé ici que s'il est déjà la cible.
   */
  protected readonly shelfOptions = computed(() =>
    this.shelves()
      .filter((shelf) => shelf.operation !== true || shelf.key === this.info().linkShelfKey)
      .map((shelf) => ({ value: shelf.key, label: shelf.label })),
  );

  /** Les opérations, avec leur état et leurs dates ; la clé désignée si le catalogue l'ignore. */
  protected readonly operationOptions = computed(() => {
    const options = (this.operations() ?? []).map((operation) => ({
      value: operation.key,
      label: operationOptionLabel(operation),
    }));
    const key = linkedOperation(this.info());
    return key === null || options.some((option) => option.value === key)
      ? options
      : [...options, { value: key, label: `${key} — inconnue du catalogue` }];
  });

  /** L'opération dont l'annonce hérite, si le catalogue la connaît. */
  protected readonly operation = computed(() => {
    const key = linkedOperation(this.info());
    return key === null ? null : operationOf(this.operations() ?? [], key);
  });

  /** Ce que la boutique calculera faute de pastille saisie — lu à l'horloge du poste. */
  protected readonly inheritedBadge = computed(() => {
    const operation = this.operation();
    return operation === null ? null : inheritedBadge(operation, new Date());
  });

  protected readonly inheritedTitle = computed(() => {
    const operation = this.operation();
    return operation === null ? null : shownIn(operation.name, this.locale());
  });

  protected readonly inheritedLede = computed(() => {
    const lede = this.operation()?.lede ?? null;
    return lede === null ? null : shownIn(lede, this.locale());
  });

  protected readonly inheritedImage = computed(() => this.operation()?.image ?? null);

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
    this.emit({ linkShelfKey: shelf, operationKey: null, action: 'shelf' });
  }

  protected setOperation(key: string | null): void {
    this.emit({ operationKey: key, linkShelfKey: null, action: 'operation' });
  }

  /** Changer d'action retire la cible de l'autre : une annonce n'en porte qu'une. */
  protected pickAction(value: string): void {
    if (!isAction(value)) {
      return;
    }
    const info = this.info();
    this.emit({
      action: value,
      linkShelfKey: value === 'shelf' ? info.linkShelfKey : null,
      operationKey: value === 'operation' ? (info.operationKey ?? null) : null,
    });
  }

  /** Le champ hérite-t-il ? Vide — dans toutes les langues pour un texte. */
  protected inherits(field: InheritedField): boolean {
    const info = this.info();
    if (field === 'image') {
      return info.image === null;
    }
    const text = info[field];
    return text === null || STOREFRONT_LOCALES.every((code) => textIn(text, code).trim() === '');
  }

  /** La croix : le champ se vide, dans toutes ses langues, et l'opération reprend la main. */
  protected inherit(field: InheritedField): void {
    this.emit(field === 'title' ? { title: { fr: '' } } : { [field]: null });
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
