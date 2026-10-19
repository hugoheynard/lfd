import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import * as content from '../vitrine-guide/vitrine-guide-content';
import { type DocRow } from '../vitrine-guide/vitrine-guide-content';
import { renderInlineMarkdown } from '../vitrine-guide/vitrine-guide-inline';
import { buildVitrineGuideMarkdown } from '../vitrine-guide/vitrine-guide-markdown';
import {
  NODE_VERIFY,
  PHP_VERIFY,
  SAMPLE_ERROR,
  SAMPLE_ITEM_JSON,
  SAMPLE_ITEM_XML,
  SAMPLE_NOTIFICATION_JSON,
  SAMPLE_READ,
  SAMPLE_REQUEST_HEADERS,
} from '../vitrine-guide/vitrine-guide-samples';
import {
  VITRINE_ELEMENT_KEY_FIELDS,
  VITRINE_ENTITIES,
  VITRINE_NOTIFICATION_FIELDS,
  type VitrineField,
} from '../vitrine-guide/vitrine-guide-schema';
import { VitrineSchemaDiagram } from '../vitrine-schema-diagram/vitrine-schema-diagram';
import { VitrineSequenceDiagram } from '../vitrine-sequence-diagram/vitrine-sequence-diagram';

/**
 * **Le guide de l'agence du site vitrine** — ce qu'un développeur extérieur
 * doit savoir pour consommer le webhook, sans avoir notre code sous les yeux.
 *
 * Écrit pour être ENVOYÉ, en PDF depuis le navigateur ou en `.md`. D'où le
 * bouton « Imprimer », la classe `print-standalone` posée sur l'hôte, que
 * `styles.scss` lit pour n'imprimer que la page, et le téléchargement en
 * Markdown — généré par `buildVitrineGuideMarkdown` depuis les mêmes sources
 * que ce gabarit (`../vitrine-guide/`), pour qu'aucun texte n'existe deux fois.
 *
 * Sources relues le 2026-10-18 : `packages/contracts/src/vitrine.ts`,
 * `shop-catalogue.ts`, `apps/lfd-api/src/b2b/vitrine/` (contrôleur, signature,
 * relais, livraison) et `platform/outbox/retry-policy.ts`. Un changement de
 * l'un d'eux laisse cette page dire l'ancien contrat : la relire alors.
 */
@Component({
  selector: 'app-doc-vitrine-guide-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldPageLayoutComponent,
    VitrineSchemaDiagram,
    VitrineSequenceDiagram,
  ],
  templateUrl: './vitrine-guide-page.html',
  styleUrls: ['../doc-page.scss', './vitrine-guide-page.scss'],
  host: { class: 'print-standalone' },
})
export class DocVitrineGuidePage {
  private readonly document = inject(DOCUMENT);

  protected readonly xmlAvailable = content.VITRINE_XML_AVAILABLE;
  protected readonly content = content;
  protected readonly inline = renderInlineMarkdown;

  protected readonly entities = VITRINE_ENTITIES;
  protected readonly notificationFields = VITRINE_NOTIFICATION_FIELDS;
  protected readonly elementKeyFields = VITRINE_ELEMENT_KEY_FIELDS;

  protected readonly samples = {
    nodeVerify: NODE_VERIFY,
    phpVerify: PHP_VERIFY,
    error: SAMPLE_ERROR,
    itemJson: SAMPLE_ITEM_JSON,
    itemXml: SAMPLE_ITEM_XML,
    notificationJson: SAMPLE_NOTIFICATION_JSON,
    read: SAMPLE_READ,
    requestHeaders: SAMPLE_REQUEST_HEADERS,
  };

  protected readonly fieldColumns: readonly FoldTableColumn<VitrineField>[] = [
    { key: 'field', label: content.FIELD_HEADERS[0], width: '13rem' },
    { key: 'type', label: content.FIELD_HEADERS[1], width: '11rem', value: (row) => row.type },
    {
      key: 'presence',
      label: content.FIELD_HEADERS[2],
      width: '9rem',
      value: (row) => row.presence,
    },
    { key: 'description', label: content.FIELD_HEADERS[3], value: (row) => row.description },
  ];
  protected readonly fieldKey = (row: VitrineField): string => row.field;

  protected readonly routeColumns = docColumns(content.ROUTE_TABLE.headers);
  protected readonly errorColumns = docColumns(content.ERROR_TABLE.headers);

  protected readonly rowKey = (row: DocRow): string => row.key;

  protected print(): void {
    window.print();
  }

  /** Le guide en `.md`, fabriqué dans le navigateur : rien ne passe par un serveur. */
  protected downloadMarkdown(): void {
    const blob = new Blob([buildVitrineGuideMarkdown(this.xmlAvailable)], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = content.VITRINE_GUIDE_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  }
}

function docColumns(
  headers: readonly [string, string, string],
): readonly FoldTableColumn<DocRow>[] {
  const [a, b, c] = headers;
  return [
    { key: 'a', label: a, width: '15rem' },
    { key: 'b', label: b, width: '13rem', value: (row) => row.b },
    { key: 'c', label: c, value: (row) => row.c },
  ];
}
