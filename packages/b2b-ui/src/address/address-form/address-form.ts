import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import {
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
  FoldViewToggleComponent,
} from 'fold-ng';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';

import { countryOptions } from '../countries';
import {
  coordinatesIssueOf,
  DEFAULT_POSTAL_FIELDS,
  formatCoordinates,
  parseCoordinates,
  type PostalAddress,
  type PostalField,
} from '../address.model';

/** Les deux façons de saisir un point : deux champs, ou un point collé. */
const ENTRY_MODES: readonly FoldViewToggleOption[] = [
  { value: 'pair', label: 'Deux champs' },
  { value: 'pasted', label: 'Point collé' },
];

/**
 * Les **champs d'une adresse postale** — le pendant saisie de `lfd-address`.
 *
 * Fragment transparent (`display: contents`) : ses champs deviennent enfants
 * directs du formulaire qui l'accueille, lequel garde l'en-tête, le pied et la
 * sauvegarde. Chaque champ est facultatif — `fields` dit lesquels montrer, et
 * les coordonnées ne viennent que si on les demande.
 *
 * Candidat `fold-ng` : les libellés visibles sont donc paramétrables, avec des
 * défauts français comme le reste de fold.
 */
@Component({
  selector: 'lfd-address-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './address-form.html',
  styleUrl: './address-form.scss',
})
export class AddressForm {
  /** Brouillon d'adresse (two-way). */
  readonly value = model.required<PostalAddress>();

  /** Les champs à montrer, dans l'ordre postal quoi qu'il arrive. */
  readonly fields = input<readonly PostalField[]>(DEFAULT_POSTAL_FIELDS);

  readonly labelHint = input('ex. Siège, Boutique Bastille');
  readonly line2Hint = input('bâtiment, étage, digicode…');
  /**
   * Nom du groupe des champs postaux — vide (défaut) = **aucun** groupe.
   *
   * Le renseigner entoure les champs d'un `fold-fieldset` nommé. À réserver
   * aux écrans où l'adresse voisine d'AUTRES groupes nommés : là, sans nom,
   * elle se lit comme une suite de champs perdus entre des blocs. Là où le
   * titre du panneau dit déjà « Adresse … », le laisser vide — deux fois le
   * même nom vaut moins qu'une fois.
   */
  readonly legend = input('');

  /**
   * Libellé de la note. Neutre par défaut : ce fragment ne sait pas QUI viendra
   * lire les consignes, et « note pour les livreurs » est un mot de l'appelant.
   */
  readonly noteLabel = input('Consignes d’accès');

  /** Exemple montré dans le champ vide — le meilleur mode d'emploi qui soit. */
  readonly notePlaceholder = input('Digicode, étage, où déposer…');

  readonly coordinatesLabel = input('Point GPS');
  readonly coordinatesHint = input('pour les lieux qu’une adresse ne suffit pas à trouver');

  protected readonly countries: readonly FoldSelectOption<string>[] = countryOptions();
  protected readonly entryModes = ENTRY_MODES;

  /** Mode de saisie du point — état d'écran, pas une donnée d'adresse. */
  protected readonly entryMode = signal<string>('pair');

  protected readonly coordinatesIssue = computed(() => coordinatesIssueOf(this.value()));
  protected readonly pastedPoint = computed(() => formatCoordinates(this.value()));

  protected has(field: PostalField): boolean {
    return this.fields().includes(field);
  }

  /**
   * Les pays proposés. Un pays enregistré que la liste ne connaît pas — une
   * vieille saisie libre, un nom dans une autre langue — est ajouté en tête :
   * sans lui, le champ s'afficherait vide et une sauvegarde l'effacerait.
   */
  protected readonly countryChoices = computed<readonly FoldSelectOption<string>[]>(() => {
    const current = this.value().country.trim();
    const known = current === '' || this.countries.some((option) => option.value === current);
    return known ? this.countries : [{ value: current, label: current }, ...this.countries];
  });

  protected set<K extends keyof PostalAddress>(key: K, value: PostalAddress[K]): void {
    this.value.update((address) => ({ ...address, [key]: value }));
  }

  /**
   * Le point collé. Tant qu'il ne se lit pas comme un couple valide, on ne
   * touche à rien : effacer la moitié d'une frappe en cours serait pire que ne
   * rien comprendre.
   */
  protected setPastedPoint(pasted: string): void {
    if (pasted.trim() === '') {
      this.value.update((address) => ({ ...address, latitude: '', longitude: '' }));
      return;
    }
    const point = parseCoordinates(pasted);
    if (point !== null) {
      this.value.update((address) => ({ ...address, ...point }));
    }
  }
}
