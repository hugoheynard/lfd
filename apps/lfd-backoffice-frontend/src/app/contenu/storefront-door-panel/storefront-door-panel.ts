import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { StorefrontImage } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from '../../pim/catalogue/library-picker/library-picker';
import { focalPositionOf } from '../storefront-focal';
import {
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

/**
 * **Une porte de l'Accueil** — « Je passe la prendre » ou la livraison : sa
 * photo, choisie dans la médiathèque, et son texte alternatif — un réglage de
 * la page, pas un objet de la grille (`documentation/mediatheque/mediatheque.md`
 * §7 bis, « L'accueil de la vitrine »). Le même panneau sert les deux portes :
 * seuls ses mots changent, par entrées (défaut : la porte retrait).
 *
 * L'aperçu la recadre sur son point focal, par le calcul de la boutique
 * ({@link focalPositionOf}) ; au centre seulement quand l'image n'en a pas
 * (depuis le 2026-10-11). Sans photo, la boutique garde un fond uni de sa
 * palette.
 *
 * Comme le formulaire d'une info, il ne garde rien : chaque geste rend la
 * porte entière (`null` : retirée), que l'éditeur range. 🔴 Une image neuve
 * repart sans alternative : celle de l'ancienne ne la décrit pas.
 */
@Component({
  selector: 'app-storefront-door-panel',
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './storefront-door-panel.html',
  styleUrl: './storefront-door-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontDoorPanel {
  private readonly panels = inject(FoldPanelHostService);

  readonly image = input.required<StorefrontImage | null>();
  readonly title = input('Porte « Je passe la prendre »');
  readonly subtitle = input(
    'La photo du retrait, sur l’accueil de la boutique — recadrée sur son point focal.',
  );
  /** Ce que la boutique montre quand la porte n'a pas de photo. */
  readonly emptyCaption = input('Aucune photo : la porte garde un fond uni.');
  readonly changed = output<StorefrontImage | null>();

  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly locale = signal<StorefrontLocale>('fr');
  protected readonly textIn = textIn;
  protected readonly positionOf = focalPositionOf;
  protected readonly altMax = TEXT_LIMITS.imageAlt.max;

  protected pickLocale(value: string): void {
    if (isLocale(value)) {
      this.locale.set(value);
    }
  }

  protected setAlt(value: string): void {
    const image = this.image();
    if (image !== null) {
      this.changed.emit({
        ...image,
        alt: optionalText(writeText(image.alt, this.locale(), value)),
      });
    }
  }

  protected remove(): void {
    this.changed.emit(null);
  }

  protected choose(): void {
    const current = this.image();
    void this.panels
      .open<LibraryPickerData, readonly PickedMedia[]>(LibraryPicker, {
        data: { already: current === null ? [] : [current.url], single: true },
      })
      .closed.then((picked) => {
        const [chosen] = picked ?? [];
        if (chosen !== undefined) {
          this.changed.emit({ url: chosen.url, alt: null, focal: chosen.focal });
        }
      });
  }

  /** Le libellé du champ, avec la langue écrite. */
  protected altLabel(): string {
    return `Texte alternatif (${this.locale().toUpperCase()})`;
  }

  /** Le français, sous le champ d'une autre langue : ce qu'on traduit. */
  protected altHint(): string {
    const source = textIn(this.image()?.alt ?? null, 'fr');
    return this.locale() === 'fr' || source === ''
      ? `${this.altMax} caractères au plus. Vide : la photo est décorative.`
      : `Français : « ${source} » — ${this.altMax} caractères au plus.`;
  }
}
