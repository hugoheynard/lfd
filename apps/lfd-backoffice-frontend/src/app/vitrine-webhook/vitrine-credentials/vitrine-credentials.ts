import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { VitrineCredentialsView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

/**
 * **Le secret et la clé, montrés UNE fois** — à la création et à la rotation.
 * La base range le secret scellé et la clé hachée : personne ne pourra les
 * relire ici, il faut les transmettre à l'agence maintenant.
 */
@Component({
  selector: 'app-vitrine-credentials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldInputComponent],
  templateUrl: './vitrine-credentials.html',
  styleUrl: './vitrine-credentials.scss',
})
export class VitrineCredentials {
  readonly credentials = input.required<VitrineCredentialsView>();
}
