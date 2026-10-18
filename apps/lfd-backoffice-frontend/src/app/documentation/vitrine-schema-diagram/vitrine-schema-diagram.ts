import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma des relations entre les entités servies à l'agence du site vitrine :
 * qui contient quoi (traits pleins) et qui renvoie à qui par une clé (traits
 * pointillés, le nom du champ sur le trait). Les clés sont ce qu'un
 * développeur d'agence doit joindre lui-même — d'où le pointillé, qui dit
 * « ce n'est pas imbriqué, c'est à retrouver ».
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-vitrine-schema-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vitrine-schema-diagram.html',
  styleUrl: './vitrine-schema-diagram.scss',
})
export class VitrineSchemaDiagram {}
