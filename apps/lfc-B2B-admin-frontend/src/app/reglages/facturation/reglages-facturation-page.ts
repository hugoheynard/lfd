import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldCalloutComponent, FoldCardComponent } from 'fold-ng';

import { FloorSchema } from './schemas/floor-schema/floor-schema';
import { PipelineSchema } from './schemas/pipeline-schema/pipeline-schema';
import { RiskSchema } from './schemas/risk-schema/risk-schema';

/**
 * Sous-page **Facturation** des Réglages — la doctrine du prix, expliquée à
 * l'équipe.
 *
 * Une page de documentation DANS l'application, et pas un document à côté : les
 * règles de prix se paramètrent deux onglets plus loin, et une doctrine qu'il
 * faut aller chercher ailleurs n'est lue par personne. C'est aussi le seul
 * endroit où un commercial qui doute d'un chiffre peut vérifier ce que le
 * système fait, sans demander à quelqu'un.
 *
 * **Elle explique, elle ne règle rien.** Aucun bouton, aucun appel réseau : ce
 * qui s'y trouve doit rester vrai sans dépendre de l'état de la base. Le jour
 * où une décision change, c'est cette page qu'on met à jour en même temps que
 * le code — au même titre que le doc d'architecture qu'elle résume.
 *
 * Trois schémas la portent, chacun pour une raison que le texte seul ne rend
 * pas : l'**ordre** des étages (une liste à puces perd que −20 % puis −5 € ≠
 * −5 € puis −20 %), la **hauteur** des deux planchers, et l'**aire** entre deux
 * courbes de prix — qui est littéralement le risque, et dont on voit d'un coup
 * de qui elle est.
 */
@Component({
  selector: 'app-reglages-facturation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldCalloutComponent, PipelineSchema, FloorSchema, RiskSchema],
  templateUrl: './reglages-facturation-page.html',
  styleUrl: './reglages-facturation-page.scss',
})
export class ReglagesFacturationPage {}
