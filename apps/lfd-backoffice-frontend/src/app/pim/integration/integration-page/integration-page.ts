import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { B2bIntegration } from '../b2b-integration/b2b-integration';

/**
 * Hub des **intégrations** — les canaux branchés sur le catalogue.
 *
 * ⚠️ **Il n'y a plus d'onglets, parce qu'il n'y a plus qu'un canal.** Cet écran
 * en a porté deux, Shopify et la boutique B2B, et son en-tête défendait l'ordre :
 * « la boutique B2B en premier, et c'est un ordre de vérité : c'est elle qui
 * facture ». Shopify est sorti le 2026-09-21
 * ([`plan-un-seul-canal-deux-prix.md`](../../../../../../documentation/pim/plan-un-seul-canal-deux-prix.md)),
 * et une barre d'onglets à un onglet est un choix qu'on n'offre pas.
 *
 * L'autre moitié de cet en-tête reste vraie et vaut d'être gardée : **un
 * nouveau canal s'ajoute en onglet, pas en promesse.** L'écran a porté un
 * onglet « Autres » qui inventoriait des canaux à la main — il mentait dès
 * qu'un canal arrivait. La barre revient avec le deuxième canal, pas avant.
 */
@Component({
  selector: 'app-integration-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, B2bIntegration],
  templateUrl: './integration-page.html',
})
export class IntegrationPage {}
