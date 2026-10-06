import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PackingSheet } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

/**
 * **« Pro » ou « Public »** après le nom du client (demande de Hugo,
 * 2026-10-06) — qui commande, tel que le fournil l'a figé à l'arrêt.
 *
 * Deux variantes SOBRES et distinctes : `info` pour le pro, `neutral` pour le
 * public. Ni l'une ni l'autre n'est un état d'alerte : c'est une étiquette,
 * pas un signal — `warning`/`alert`/`success` disent déjà autre chose sur cet
 * écran (retenue, à refaire).
 *
 * **Rien sur `null`** : une commande d'une journée arrêtée avant le champ, ou
 * d'avant la distinction côté commerce. Un badge deviné serait un mensonge.
 *
 * Un composant pour deux endroits — la liste et l'en-tête de la commande
 * ouverte — pour qu'un réglage ne les fasse pas diverger.
 */
@Component({
  selector: 'app-clientele-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './clientele-badge.html',
  styleUrl: './clientele-badge.scss',
})
export class ClienteleBadge {
  readonly clientele = input.required<PackingSheet['clientele']>();

  protected readonly badge = computed(() => {
    switch (this.clientele()) {
      case 'pro':
        return { content: 'Pro', variant: 'info' } as const;
      case 'public':
        return { content: 'Public', variant: 'neutral' } as const;
      default:
        return null;
    }
  });
}
