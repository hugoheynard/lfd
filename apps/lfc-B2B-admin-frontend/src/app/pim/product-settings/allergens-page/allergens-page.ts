import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCalloutComponent, FoldEmptyStateComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Allergènes** — l'écran est POSÉ, la fonction reste à déménager.
 *
 * Ce qui existe aujourd'hui, et qu'il ne faut pas confondre :
 *
 * - le **référentiel** GS1 (quels codes existent, leur libellé d'étiquette
 *   INCO) est en dur côté domaine et servi par `GET /pim/reference/allergens` ;
 * - la **déclaration** d'une fiche se coche sur la DÉCLINAISON, dans la
 *   section « Fiche réglementaire ».
 *
 * C'est le premier qui viendra ici. Le second reste sur la fiche : c'est elle
 * qui est mise sur le marché, et une déclaration réglementaire se prend en
 * regardant le produit, pas une table de réglages.
 *
 * Une page vide plutôt qu'une entrée absente : l'entrée de menu dit où ça ira,
 * et cette page dit ce qui n'est pas encore là. Une entrée qui ouvrirait un
 * écran plausible mais inerte serait pire.
 */
@Component({
  selector: 'app-allergens-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldEmptyStateComponent, FoldCalloutComponent],
  templateUrl: './allergens-page.html',
})
export class AllergensPage {}
