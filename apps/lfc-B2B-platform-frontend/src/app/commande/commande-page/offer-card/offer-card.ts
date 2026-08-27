import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

/** Le ton d'une offre : ce que portent la pastille et le voile de la photo. */
export type OfferTone = 'ink' | 'vivid' | 'butter';

/** Le ton de la condition, en bas de carte — informative ou commerciale. */
export type OfferNoteTone = 'info' | 'accent';

/**
 * Quelle photo la carte porte. Trois pièces pour quatre cartes : le traiteur et
 * le coursier partagent la même — c'est le cadrage de la réf, pas un oubli.
 */
export type OfferPhoto = 'labo' | 'coursier' | 'noel';

/**
 * Une offre proposée en pleine largeur : un mode de service, une opération
 * datée, le traiteur.
 *
 * La réf leur donne à toutes le MÊME gabarit — bandeau photo, pastille, titre en
 * deux lignes, détail, condition — et c'est le propos : sur cet écran, prendre
 * rendez-vous pour Noël et se faire livrer sont deux façons également légitimes
 * de commencer. Une opération reléguée en bannière n'aurait pas ce poids.
 *
 * Pour les modes de service, le nom apparaît DEUX FOIS : la pastille porte le mot
 * du fournil — celui du bon de commande — et le titre celui du client.
 */
@Component({
  selector: 'app-offer-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[attr.data-tone]': 'tone()', '[attr.data-photo]': 'photo()' },
  templateUrl: './offer-card.html',
  styleUrl: './offer-card.scss',
})
export class OfferCard {
  readonly tone = input.required<OfferTone>();
  readonly photo = input.required<OfferPhoto>();

  /** Le mot court, dans la pastille sur la photo. */
  readonly badge = input.required<string>();

  /** Le titre, sur la photo. Deux lignes séparées par un retour. */
  readonly title = input.required<string>();

  /** Ce que c'est, sous la photo. */
  readonly detail = input.required<string>();

  /** Le délai, l'échéance, la remise — ce qui décide vraiment. */
  readonly note = input.required<string>();

  readonly noteTone = input<OfferNoteTone>('info');

  readonly chosen = output<void>();
}
