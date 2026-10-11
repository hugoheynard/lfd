import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import type { CapabilitiesReport, CapabilitySeverity } from '@lfd/ops-contract';

/** La lecture, vue par la page qui la porte. */
export type CapabilitiesState = 'loading' | 'error' | 'ready';

type Tone = 'warning' | 'alert';

/** La gravité, en couleur sémantique : le jugement vient du serveur. */
const TONE: Readonly<Record<CapabilitySeverity, Tone>> = {
  blocking: 'alert',
  degraded: 'warning',
};

const LABEL: Readonly<Record<CapabilitySeverity, string>> = {
  blocking: 'Bloquante',
  degraded: 'Dégradée',
};

/** Le serveur écrit `—` quand la panne ne dépend d'aucune variable (une migration, par exemple). */
const NO_SETTING = '—';

/**
 * **Capacités** — ce que l'instance en service ne sait pas faire, et le
 * réglage qui le lui rendrait.
 *
 * Écrite pour du personnel sans jeton ni journal : la capacité, ce qu'elle
 * empêche, le NOM de la variable à poser et où la poser. Les valeurs ne
 * voyagent jamais jusqu'ici. La page décide où la carte s'affiche (en tête
 * s'il y a une bloquante) ; la carte ne fait que dire.
 */
@Component({
  selector: 'app-capabilities',
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './capabilities.html',
  styleUrl: './capabilities.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Capabilities {
  readonly state = input.required<CapabilitiesState>();
  readonly report = input.required<CapabilitiesReport | null>();
  readonly retry = output();

  protected readonly tone = (severity: CapabilitySeverity): Tone => TONE[severity];
  protected readonly label = (severity: CapabilitySeverity): string => LABEL[severity];
  protected readonly hasSetting = (setting: string): boolean => setting !== NO_SETTING;
}
