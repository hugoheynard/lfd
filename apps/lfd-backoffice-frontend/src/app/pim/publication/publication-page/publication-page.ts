import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { PublicationB2b } from '../publication-b2b/publication-b2b';

/**
 * Hub de **publication** — le catalogue FOLIE COFFEE poussé vers son canal.
 *
 * ⚠️ **Plus d'onglets : il n'y a plus qu'un canal.** L'écran en portait deux,
 * et son en-tête notait que l'onglet B2B avait longtemps manqué « alors que le
 * canal savait pousser côté serveur — prix, taux de TVA et publications
 * n'avaient donc aucun chemin jusqu'à la boutique depuis cet écran ». Shopify
 * est sorti le 2026-09-21
 * ([`plan-un-seul-canal-deux-prix.md`](../../../../../../documentation/pim/plan-un-seul-canal-deux-prix.md)),
 * et c'est le canal qui facture qui reste seul.
 *
 * ⚠️ Avec lui partent les **collections de taxe**, qui n'étaient pas une notion
 * du référentiel mais la façon dont Shopify rangeait la TVA — un handle
 * `tva-5-5` par taux. Le taux, lui, n'a pas bougé de place : il vit à
 * l'intersection `(article × contexte de vente)`, et la boutique B2B lit un
 * nombre.
 */
@Component({
  selector: 'app-publication-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, PublicationB2b],
  templateUrl: './publication-page.html',
})
export class PublicationPage {}
