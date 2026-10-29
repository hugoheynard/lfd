import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FoldButtonComponent, FoldDangerZoneComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * **Archiver la fiche** — la carte de l'onglet « Danger » (demande de Hugo,
 * 2026-10-29). Le geste vivait au bas du rail de publication, à côté
 * d'« Activer » ; il sort la fiche du catalogue, il se range donc avec ce qui
 * sort quelque chose.
 *
 * Le geste inverse, « Restaurer », RESTE dans le rail : sur une fiche archivée,
 * cette carte ne fait que le dire. L'appel au serveur reste à la page
 * (`archive()`), comme pour les autres gestes de cycle de vie.
 */
@Component({
  selector: 'app-product-archive',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldDangerZoneComponent, FoldInlineConfirmComponent],
  templateUrl: './product-archive.html',
  styleUrl: './product-archive.scss',
})
export class ProductArchive {
  protected readonly store = inject(ProductFormStore);

  /** La confirmation a été donnée : la page lance le geste. */
  readonly archive = output();
}
