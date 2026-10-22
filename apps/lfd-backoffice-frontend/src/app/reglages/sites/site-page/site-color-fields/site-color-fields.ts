import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
} from 'fold-ng';

import { normalizeSiteColor, siteColorIssue } from '../../site-color';
import type { ColorKey, ColorSlot, SiteColorsDraft } from './site-colors-draft';

/** Une saisie de couleur, remontée à la carte qui tient le brouillon. */
export interface ColorChange {
  readonly key: ColorKey;
  /** `null` : « Aucune couleur ». */
  readonly value: string | null;
}

/**
 * **Les champs de couleur d'une capacité** — sous « Remet » ou sous
 * « Livraison », dans la carte des rôles (Hugo, 2026-10-13). Présentation
 * seule : le brouillon et l'enregistrement appartiennent à la carte.
 */
@Component({
  selector: 'app-site-color-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldFieldsetComponent, FoldInputComponent],
  templateUrl: './site-color-fields.html',
  styleUrl: './site-color-fields.scss',
})
export class SiteColorFields {
  readonly slots = input.required<readonly ColorSlot[]>();
  readonly draft = input.required<SiteColorsDraft>();
  readonly issues = input<Partial<Record<ColorKey, string>>>({});
  /** Les champs grisés, et pourquoi. */
  readonly closed = input<Partial<Record<ColorKey, string>>>({});
  readonly readOnly = input(false);
  readonly colorChange = output<ColorChange>();

  protected locked(key: ColorKey): boolean {
    return this.readOnly() || this.closed()[key] !== undefined;
  }

  /** La couleur à peindre dans la pastille : seulement une couleur bien formée. */
  protected swatch(key: ColorKey): string | null {
    const value = this.draft()[key];
    return value !== null && siteColorIssue(value) === null ? normalizeSiteColor(value) : null;
  }

  /** Le sélecteur natif n'accepte que `#rrggbb` en minuscules. */
  protected pickerValue(key: ColorKey): string {
    return this.swatch(key) ?? '';
  }

  protected change(key: ColorKey, value: string | null): void {
    this.colorChange.emit({ key, value });
  }
}
