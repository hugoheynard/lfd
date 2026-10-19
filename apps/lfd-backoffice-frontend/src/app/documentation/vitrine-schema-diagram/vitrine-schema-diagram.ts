import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
  SCHEMA_BOXES,
  SCHEMA_LEGEND,
  SCHEMA_REFERENCES,
} from '../vitrine-guide/vitrine-guide-diagrams';

/**
 * Schéma des relations entre les entités servies à l'agence du site vitrine :
 * qui contient quoi (traits pleins) et qui renvoie à qui par une clé (traits
 * pointillés, le nom du champ sur le trait). Les clés sont ce qu'un
 * développeur d'agence doit joindre lui-même — d'où le pointillé, qui dit
 * « ce n'est pas imbriqué, c'est à retrouver ».
 *
 * Libellés lus dans `vitrine-guide-diagrams.ts`, que le guide Markdown
 * recopie en Mermaid. Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-vitrine-schema-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vitrine-schema-diagram.html',
  styleUrl: './vitrine-schema-diagram.scss',
})
export class VitrineSchemaDiagram {
  protected readonly boxes = SCHEMA_BOXES;
  protected readonly references = SCHEMA_REFERENCES;
  protected readonly legend = SCHEMA_LEGEND;
}
