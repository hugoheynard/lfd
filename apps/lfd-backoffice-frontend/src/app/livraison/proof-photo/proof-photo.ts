import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

/**
 * **La photo d'une remise à la porte** (`plan-a-la-porte.md`, B1, B2, § 9) —
 * l'appareil photo du téléphone, la photo jointe, la retirer. Commune à
 * « Remis au client » et « Déposé avec preuve » : toute remise porte une photo.
 */
@Component({
  selector: 'app-proof-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './proof-photo.html',
  styleUrl: './proof-photo.scss',
})
export class ProofPhoto {
  /** Le libellé du bouton qui ouvre l'appareil. */
  readonly prompt = input.required<string>();
  /** La photo prise, ou `null`. */
  readonly photo = model<File | null>(null);

  protected pick(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.photo.set(target.files?.item(0) ?? null);
    }
  }
}
