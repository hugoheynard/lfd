import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';
import type { FoldIconName } from 'fold-ng';

import { formatPostalInline, postalLines, type PostalAddress } from '../address.model';

/**
 * Une **adresse postale affichée** — le pendant lecture de `lfd-address-form`.
 *
 * `stack` empile les lignes dans un `<address>` (fiches, cartes) ; `inline` les
 * met bout à bout (récapitulatifs, lignes de liste). Le nom d'usage est un
 * **titre**, pas une ligne d'adresse : il vit au-dessus, et c'est là que la
 * projection de contenu dépose les badges de l'appelant (« Par défaut », une
 * remise…) — le composant n'en connaît aucun.
 *
 * Candidat `fold-ng` : zéro vocabulaire métier.
 */
@Component({
  selector: 'lfd-address',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './address-view.html',
  styleUrl: './address-view.scss',
  host: { '[class.is-inline]': "layout() === 'inline'" },
})
export class AddressView {
  readonly address = input.required<PostalAddress>();
  readonly layout = input<'stack' | 'inline'>('stack');

  /**
   * La punaise devant l'adresse. Vraie par défaut : dans une liste, c'est elle
   * qui fait lire « un lieu » avant même les mots. `[icon]="false"` dans les
   * contextes où la nature du bloc est déjà dite autrement.
   */
  readonly icon = input(true);
  readonly iconName = input<FoldIconName>('map-pin');

  protected readonly lines = computed(() => postalLines(this.address()));
  protected readonly inline = computed(() => formatPostalInline(this.address()));
}
