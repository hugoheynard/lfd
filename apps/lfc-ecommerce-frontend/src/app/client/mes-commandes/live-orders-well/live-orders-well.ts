import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { FoldScrollIndicatorComponent, FoldWellComponent } from '../../../../shared';
import type { TrackedOrder } from '../order-rows';
import { TrackCard } from '../track-card/track-card';

/**
 * **MES SUIVIS** — le puits des commandes vivantes, tel que la maquette du
 * 2026-09-20 le pose sur l'accueil (`captures/12-suivis.png`).
 *
 * 🔴 **La carte, elle, ne change pas** : c'est `app-track-card`, celle de « Mes
 * commandes », avec son stepper, ses quatre étapes datées et son QR de retrait.
 * En écrire une seconde aurait donné deux dessins du même fait, et c'est ainsi
 * qu'un écran finit par annoncer une étape que l'autre n'a pas franchie.
 *
 * Ce composant n'apporte que l'ASSEMBLAGE : le puits sombre, sa tête, la sortie
 * vers l'historique et les puces de défilement.
 *
 * ⚠️ Il ne se montre PAS quand il n'a rien à suivre — c'est l'écran qui le
 * décide, et l'accueil ne le monte pas. Le puits de « Mes commandes » a, lui,
 * un état vide, et c'est juste : là-bas, l'absence de commande est la réponse à
 * la question posée. Ici, ce serait un bloc qui occupe la page pour dire qu'il
 * n'a rien à dire.
 */
@Component({
  selector: 'app-live-orders-well',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, FoldScrollIndicatorComponent, FoldWellComponent, TrackCard],
  templateUrl: './live-orders-well.html',
  styleUrl: './live-orders-well.scss',
})
export class LiveOrdersWell {
  readonly orders = input.required<readonly TrackedOrder[]>();
  readonly title = input.required<string>();
  /** Le compte des commandes en cours, déjà mis en forme par l'écran. */
  readonly subtitle = input.required<string>();
  readonly allLabel = input.required<string>();
  readonly dotLabel = input.required<string>();

  /** L'identifiant SERVEUR de la commande dont on demande le QR. */
  readonly qrAsked = output<string>();
  readonly allAsked = output<void>();
}
