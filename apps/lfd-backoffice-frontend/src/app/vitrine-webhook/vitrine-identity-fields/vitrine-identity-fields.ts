import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FoldFieldsetComponent, FoldInputComponent, FoldTextareaComponent } from 'fold-ng';

/**
 * **Qui est l'abonné** — son nom, à quoi il sert, où écrire à l'agence. Les
 * mêmes champs à la création et au geste « Modifier ». La description et le
 * contact restent au back-office : rien ne part chez l'agence.
 */
@Component({
  selector: 'app-vitrine-identity-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldFieldsetComponent, FoldInputComponent, FoldTextareaComponent],
  templateUrl: './vitrine-identity-fields.html',
})
export class VitrineIdentityFields {
  readonly name = model('');
  readonly description = model('');
  readonly contactEmail = model('');
}
