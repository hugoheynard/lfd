import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCardComponent, FoldElementTitleComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Segmentation web** — ce que le catalogue devient côté vitrine, et la seule
 * chose à en retenir : la famille TVA n'y paraît jamais.
 */
@Component({
  selector: 'app-doc-web-segmentation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './web-segmentation-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocWebSegmentationPage {}
