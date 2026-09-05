import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { OrderContextStore } from '../../../order-context.store';

/**
 * **Le cadre de la commande, sur une ligne** — où l'on est servi, et quand.
 *
 * Deux états qui ne sont pas deux composants : la barre **rappelle** le mode
 * quand il est pris, et le **demande** quand il ne l'est pas. C'est la même
 * place à l'écran et le même geste au clic — les séparer aurait fait deux
 * emplacements pour une seule question, et l'un des deux aurait fini par bouger
 * sans l'autre.
 *
 * L'invite est plus haute que le rappel, à dessein : deux lignes et le beurre
 * pâle disent qu'il reste quelque chose à faire, là où le rappel se contente
 * d'être vrai.
 *
 * 🔴 **Elle lit le store, elle ne reçoit pas d'entrée**, et c'est le `null` qui
 * décide. Un `[service]` aurait fait relayer par chaque page un état qu'elle ne
 * possède pas : le mode de service ne dépend d'aucun écran, il leur survit à
 * tous — c'est même sa définition. Surtout, l'absence de choix n'est pas un cas
 * limite mais **la question principale de la barre** ; la faire descendre en
 * `null` d'un parent aurait donné à chaque page l'occasion de l'oublier.
 *
 * Le clic, lui, ne navigue pas : la barre dit qu'on veut revenir à la question,
 * c'est la page qui sait où elle est.
 */
@Component({
  selector: 'app-order-context-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-context-bar.html',
  styleUrl: './order-context-bar.scss',
})
export class OrderContextBar {
  /** Le client veut (re)choisir son mode de service. */
  readonly changeRequested = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly service = inject(OrderContextStore).choice;
}
