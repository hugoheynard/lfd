import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * **Comment un prix se construit** — le pipeline, de gauche à droite.
 *
 * Dessiné plutôt que décrit parce que c'est un ORDRE : « −20 % puis −5 € » ne
 * donne pas le même prix que « −5 € puis −20 % », et une liste à puces perd
 * exactement cette information.
 *
 * La limite est en dehors de la chaîne, sous elle : ce n'est pas un étage, c'est
 * ce que l'empilement ne franchit pas. La mettre en ligne aurait fait croire
 * qu'elle s'applique à son rang de lecture.
 */
@Component({
  selector: 'app-pipeline-schema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pipeline-schema.html',
  styleUrl: './pipeline-schema.scss',
})
export class PipelineSchema {}
