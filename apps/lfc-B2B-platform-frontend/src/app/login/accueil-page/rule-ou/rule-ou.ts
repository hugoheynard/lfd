import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Le filet « ou » qui sépare la voie principale de la porte de secours. */
@Component({
  selector: 'app-rule-ou',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rule-ou.html',
  styleUrl: './rule-ou.scss',
})
export class RuleOu {}
