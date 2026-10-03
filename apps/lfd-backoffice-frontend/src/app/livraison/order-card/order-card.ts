import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldBadgeComponent, FoldCardComponent } from 'fold-ng';

/** Une étiquette sous le nom : ce qui cloche ou ce qu'il faut savoir, et son ton. */
export interface OrderCardTag {
  readonly label: string;
  readonly variant: 'neutral' | 'info' | 'warning' | 'alert';
}

/** Le liseré gauche d'une carte : signal (rouge), fenêtre ou rapportée (ambre), proposé (bleu). */
export type OrderCardEdge = 'none' | 'alert' | 'warning' | 'proposed';

/** Le rond du numéro de passage : graphite, bleu si proposé, gris si la tournée est partie. */
export type OrderCardMark = 'placed' | 'proposed' | 'frozen';

/**
 * **La carte d'une commande** dans l'organisateur de tournées
 * (`handoff-tournees/SPEC.md`, §§ 2 et 3.3) — à répartir, ou arrêt d'une
 * tournée : la poignée ou le numéro de passage, le nom, `référence · ville`,
 * la fenêtre en chasse fixe, puis les étiquettes.
 *
 * Elle ne décide rien et ne glisse rien elle-même : le tableau la rend
 * déplaçable, et projette ses gestes clavier — `[cardKeys]` à côté de la
 * fenêtre (↑ ↓), le reste dessous (« Mettre dans », « Retirer »).
 */
@Component({
  selector: 'app-order-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldCardComponent],
  templateUrl: './order-card.html',
  styleUrl: './order-card.scss',
  host: {
    role: 'listitem',
    '[attr.tabindex]': '0',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class OrderCard {
  readonly title = input.required<string>();
  /** « CMD-2041 · Val-d’Isère ». */
  readonly meta = input.required<string>();
  /** « 07 h–08 h », « avant 08 h 30 », « sans créneau ». */
  readonly window = input.required<string>();
  readonly ariaLabel = input.required<string>();
  /** Le rang de passage, `null` pour une commande à répartir. */
  readonly position = input<number | null>(null);
  readonly mark = input<OrderCardMark>('placed');
  /** La poignée ⋮⋮ : seulement si la carte se glisse. */
  readonly handle = input(false);
  readonly edge = input<OrderCardEdge>('none');
  readonly tags = input<readonly OrderCardTag[]>([]);
  /** La tournée est partie : la carte s'éteint. */
  readonly frozen = input(false);
  /** Le titre en rouge : un signal à retirer (Q11). */
  readonly signaled = input(false);
  /** La fenêtre en ambre : intenable dans cet ordre (C8). */
  readonly windowClash = input(false);
  /** Survolée ici, sur la carte ou dans la liste sous la carte. */
  readonly highlighted = input(false);
}
