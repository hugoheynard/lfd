import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { UpsertDiagram } from '../../upsert-diagram/upsert-diagram';

/**
 * **Intégration Shopify** — pourquoi un push ne recrée jamais, et ce qui
 * échappe encore à l'API.
 */
@Component({
  selector: 'app-doc-shopify-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    UpsertDiagram,
  ],
  templateUrl: './shopify-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocShopifyPage {}
