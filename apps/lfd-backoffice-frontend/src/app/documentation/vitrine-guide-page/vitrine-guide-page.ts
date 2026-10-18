import { ChangeDetectionStrategy, Component } from '@angular/core';
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
 * 🚩 **Le XML est servi** depuis le 2026-10-18 : `Accept: application/xml`,
 * `?format=xml` et `GET /vitrine/schema.xsd` répondent
 * (`apps/lfd-api/src/b2b/vitrine/http/vitrine.controller.ts`). Le drapeau
 * reste pour qu'un retrait se fasse en une ligne.
 */
export const VITRINE_XML_AVAILABLE = true;

/** Une ligne d'un tableau qui n'est pas un champ : une route, une erreur, un en-tête. */
interface DocRow {
  readonly key: string;
  readonly a: string;
  readonly b: string;
  readonly c: string;
}

/**
 * **Le guide de l'agence du site vitrine** — ce qu'un développeur extérieur
 * doit savoir pour consommer le webhook, sans avoir notre code sous les yeux.
 *
 * Écrit pour être ENVOYÉ : Hugo l'imprime en PDF depuis le navigateur. D'où
 * le bouton « Imprimer », et la classe `print-standalone` posée sur l'hôte,
 * que `styles.scss` lit pour n'imprimer que la page, sans le menu de l'app.
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
  protected readonly xmlAvailable = VITRINE_XML_AVAILABLE;

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
    { key: 'field', label: 'Champ', width: '13rem' },
    { key: 'type', label: 'Type', width: '11rem', value: (row) => row.type },
    { key: 'presence', label: 'Présence', width: '9rem', value: (row) => row.presence },
    { key: 'description', label: 'Description', value: (row) => row.description },
  ];
  protected readonly fieldKey = (row: VitrineField): string => row.field;

  protected readonly routeColumns = docColumns('Route', 'Rend', 'Notes');
  protected readonly routes: readonly DocRow[] = [
    {
      key: 'catalogue',
      a: 'GET /vitrine/catalogue',
      b: 'Le catalogue',
      c: 'Tout, en une fois : rayons, articles, opérations. La relecture la plus simple.',
    },
    {
      key: 'article',
      a: 'GET /vitrine/articles/:sku',
      b: 'Article',
      c: '404 si l’article n’est plus en vente au public (traitez-le comme retiré).',
    },
    {
      key: 'textes',
      a: 'GET /vitrine/textes',
      b: 'Les textes',
      c: 'Les textes de la boutique dans la langue demandée.',
    },
    {
      key: 'schema',
      a: 'GET /vitrine/schema.xsd',
      b: 'Le schéma XSD',
      c: 'Décrit les trois lectures en XML. Sans clé.',
    },
  ];

  protected readonly errorColumns = docColumns('Statut', 'code', 'Cas');
  protected readonly errors: readonly DocRow[] = [
    {
      key: '400',
      a: '400',
      b: 'http.payload.invalid',
      c: 'lang inconnue (autre que fr, en, it), ou format inconnu (autre que json, xml).',
    },
    {
      key: '403',
      a: '403',
      b: 'vitrine.read_key.refused',
      c: 'Clé absente, inconnue, remplacée par une régénération, ou abonnement coupé de notre côté.',
    },
    {
      key: '404',
      a: '404',
      b: 'vitrine.article.not_found',
      c: 'Article absent de votre vue (GET /vitrine/articles/:sku seulement).',
    },
    {
      key: '429',
      a: '429',
      b: '—',
      c: 'Plus de 60 requêtes par minute depuis la même adresse IP.',
    },
  ];

  protected readonly rowKey = (row: DocRow): string => row.key;

  protected print(): void {
    window.print();
  }
}

function docColumns(a: string, b: string, c: string): readonly FoldTableColumn<DocRow>[] {
  return [
    { key: 'a', label: a, width: '15rem' },
    { key: 'b', label: b, width: '13rem', value: (row) => row.b },
    { key: 'c', label: c, value: (row) => row.c },
  ];
}
