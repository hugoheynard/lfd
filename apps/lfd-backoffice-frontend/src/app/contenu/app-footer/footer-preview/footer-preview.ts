import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  ContentLocale,
  FooterLocaleContent,
  LegalIdentity,
  LegalMentionDisplay,
} from '@lfd/contracts';
import { legalMentionLabels, legalMentionOrder } from '@lfd/contracts/content-values';

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
  /** La langue affichée : c'est elle qui choisit le mot de chaque mention. */
  readonly locale = input.required<ContentLocale>();
  /** Quelles mentions s'affichent — la même décision dans les trois langues. */
  readonly legalMentions = input.required<LegalMentionDisplay>();

  /**
   * Les mentions COCHÉES, dans l'ordre du contrat.
   *
   * L'aperçu sert à voir ce que le bandeau portera : une mention décochée y
   * disparaît tout de suite, ce qu'aucune liste de cases ne montre. Le mot vient
   * du contrat — l'écran choisit ce qui s'affiche, jamais comment ça s'écrit.
   *
   * ⚠️ Les CGV ont porté ici le TITRE de leur document, lu à part. Elles n'y
   * font plus exception : la barre nomme l'obligation pour les cinq, et le
   * titre est ce que le dialogue affiche (tranché le 2026-09-13). L'exception
   * obligeait sinon à charger les cinq documents pour nommer une barre que
   * personne n'a encore ouverte.
   */
  protected readonly legalLinks = computed(() => {
    const shown = this.legalMentions();
    const locale = this.locale();
    return legalMentionOrder
      .filter((mention) => shown[mention])
      .map((mention) => legalMentionLabels[locale][mention]);
  });

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
