import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FooterLocaleContent, LegalIdentity } from '@lfd/contracts';

/**
 * L'**aperçu de disposition** du pied de page.
 *
 * Il montre la FORME, pas la peau : les quatre colonnes, leurs proportions, ce
 * qui tombe dans le bandeau légal. Volontairement en gris — reproduire les
 * couleurs de la vitrine ici en ferait une seconde implémentation du pied de
 * page, qui dériverait au premier ajustement, et donnerait au rédacteur une
 * confiance que cet écran n'a pas les moyens de tenir.
 *
 * Ce qu'il sert à voir, et qu'aucun formulaire ne montre : qu'une colonne est
 * vide, qu'un pitch déborde son voisin, qu'une liste a douze entrées quand les
 * autres en ont six.
 */
@Component({
  selector: 'app-footer-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer-preview.html',
  styleUrl: './footer-preview.scss',
})
export class FooterPreview {
  readonly content = input.required<FooterLocaleContent>();
  readonly identity = input.required<LegalIdentity>();

  /**
   * Les mentions d'identité qui sont RENSEIGNÉES, dans l'ordre de la barre.
   *
   * Ce qui est vide ne laisse pas de trou : la vitrine omet, l'aperçu aussi.
   * C'est ce qui permet de voir ici ce qui manque encore — un SIRET absent se
   * remarque parce que la barre est courte, pas parce qu'un tiret traîne.
   */
  protected readonly mentions = computed(() => {
    const id = this.identity();
    return [id.company, id.capital, id.siret, id.rcs, id.vat].filter((value) => value !== '');
  });
}
