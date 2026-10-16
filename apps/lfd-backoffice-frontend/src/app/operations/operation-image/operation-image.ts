import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CommerceOperationView } from '@lfd/contracts';

/**
 * L'image d'une opération, avec le texte alternatif de la MÉDIATHÈQUE et
 * son point focal (lot 3 : l'opération ne garde plus son propre `alt`). Un
 * `alt` vide est dit, pas masqué : c'est à la médiathèque de l'écrire.
 */
@Component({
  selector: 'app-operation-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './operation-image.html',
  styleUrl: './operation-image.scss',
})
export class OperationImage {
  readonly image = input.required<NonNullable<CommerceOperationView['image']>>();

  /** Le point focal en `object-position` ; le centre sans point. */
  protected readonly position = computed(() => {
    const focal = this.image().focal;
    return focal === null ? '50% 50%' : `${String(focal.x * 100)}% ${String(focal.y * 100)}%`;
  });
}
