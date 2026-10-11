import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

/**
 * **La médiathèque**, expliquée au personnel qui l'alimente.
 *
 * Écrite pour qui dépose et tague les photos, pas pour qui lit le code : aucun
 * nom de table ni de route. Sa source est `documentation/mediatheque/` ; les
 * libellés cités sont ceux de l'écran (relus le 2026-10-11) — un bouton
 * renommé là-bas laisse cette page dire un mot que plus personne ne voit.
 */
@Component({
  selector: 'app-doc-media-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    RouterLink,
  ],
  templateUrl: './media-library-page.html',
  styleUrl: '../doc-page.scss',
})
export class DocMediaLibraryPage {}
