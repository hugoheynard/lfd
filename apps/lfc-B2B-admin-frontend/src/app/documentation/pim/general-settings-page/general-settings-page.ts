import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { CatalogueToToolDiagram } from '../../catalogue-to-tool-diagram/catalogue-to-tool-diagram';
import { ContextAnatomyDiagram } from '../../context-anatomy-diagram/context-anatomy-diagram';
import { OfferDiagram } from '../../offer-diagram/offer-diagram';
import { ProContextDiagram } from '../../pro-context-diagram/pro-context-diagram';
import { VatIntersectionDiagram } from '../../vat-intersection-diagram/vat-intersection-diagram';
import { VatLawDiagram } from '../../vat-law-diagram/vat-law-diagram';

/**
 * **Paramétrage général** — les deux notions dont tout le référentiel dépend :
 * le contexte de vente et le point de vente.
 *
 * Elles étaient deux sections séparées, et c'était l'ordre le plus coûteux :
 * un point de vente se définit par les contextes qu'il offre, donc l'expliquer
 * ailleurs obligeait à renvoyer d'un onglet à l'autre pour comprendre une seule
 * phrase. Une page, et la définition arrive avant son usage.
 *
 * Elle ouvre par le POURQUOI plutôt que par le quoi. La question qu'on se pose
 * devant l'écran des contextes n'est pas « comment j'en ajoute un » — c'est
 * « pourquoi cette liste-là ». Y répondre par la loi (cf. {@link VatLawDiagram})
 * est la seule façon d'empêcher qu'on en ouvre un pour un canal de vente.
 *
 * Et la règle est suivie de son exception (cf. {@link ProContextDiagram}) au
 * lieu d'être laissée seule : la vente pro porte le taux de l'à-emporter, donc
 * deux colonnes s'y lisent comme un doublon. La duplication est assumée pour
 * une raison de responsabilité de la donnée, et une raison assumée qu'on n'écrit
 * pas est une raison que le prochain rangement effacera.
 */
@Component({
  selector: 'app-doc-general-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    VatLawDiagram,
    ProContextDiagram,
    ContextAnatomyDiagram,
    VatIntersectionDiagram,
    CatalogueToToolDiagram,
    OfferDiagram,
  ],
  templateUrl: './general-settings-page.html',
  styleUrl: '../../doc-page.scss',
})
export class DocGeneralSettingsPage {}
