import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent, type FoldIconName } from 'fold-ng';

/**
 * La porte vers l'autre entrée : « Déjà client ? » depuis l'accueil, « Première
 * visite ? » depuis la connexion. Une seule porte, deux tons — bleue quand elle
 * appelle (l'accueil pousse vers la connexion), claire quand elle se contente
 * d'exister.
 */
@Component({
  selector: 'app-door-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.solid]': "tone() === 'solid'" },
  imports: [FoldIconComponent],
  templateUrl: './door-card.html',
  styleUrl: './door-card.scss',
})
export class DoorCard {
  readonly title = input.required<string>();
  readonly sub = input.required<string>();
  readonly icon = input.required<FoldIconName>();
  readonly tone = input<'solid' | 'quiet'>('quiet');
  readonly opened = output<void>();
}
