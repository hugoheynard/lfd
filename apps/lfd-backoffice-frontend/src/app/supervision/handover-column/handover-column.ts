import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FulfillmentMethod } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import { ALL_POINTS, atPoint, slotLayout } from '../handover-layout';
import type { SlotItem } from '../handover-layout';
import type { HandoverBoard, SlotGroup, SlotRow } from '../handover-slots';
import { countLabel, durationLabel } from '../supervision-labels';
import { SUPERVISION_LINKS } from '../supervision-links';
import { NO_MATCHES } from '../supervision-search';

/**
 * **Colonne 3 · Retrait / livraison — l'unité est le créneau.** Deux métiers,
 * séparés par les onglets de `app-handover-band`, que la page pose dans la bande (A4) ;
 * chacun groupé par tranche horaire, avec le repère « Maintenant » et les
 * tranches terminées repliées en bas (A8).
 *
 * Ni Remettre, ni Scanner, ni Appeler (plan §1) : une commande prête renvoie
 * vers le retrait, qui opère. La tournée de la maquette n'a pas de donnée
 * (plan §7) : l'onglet Livraison liste les commandes par créneau, sans ordre
 * de route.
 */
@Component({
  selector: 'app-handover-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './handover-column.html',
  styleUrl: './handover-column.scss',
})
export class HandoverColumn {
  readonly board = input.required<HandoverBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);
  /** Ce que la recherche du masthead désigne, par numéro de commande. */
  readonly matches = input(NO_MATCHES);
  /** `supervision/day` a échoué : la file reste, mais aucun retard n'est jugé. */
  readonly latenessUnknown = input(false);

  protected readonly link = SUPERVISION_LINKS.handover;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** L'acheminement lu — choisi par la bande (`app-handover-band`), relié par la page. */
  readonly method = model<FulfillmentMethod>('pickup');
  /** Le point de retrait filtré ; `ALL_POINTS` = tous. Sans effet sur la livraison. */
  readonly point = model<string>(ALL_POINTS);
  /** Les tranches terminées que l'on a dépliées, par clé. */
  private readonly unfolded = signal<ReadonlySet<string>>(new Set());
  private placedOnNow = false;

  protected readonly groups = computed<readonly SlotGroup[]>(() =>
    this.method() === 'pickup'
      ? atPoint(this.board().pickup, this.point() === ALL_POINTS ? null : this.point())
      : this.board().delivery,
  );

  protected readonly items = computed(() => slotLayout(this.groups(), this.board().clock));

  /** En « Tous les points », chaque ligne de retrait dit son point (A8). */
  protected readonly showPoint = computed(
    () => this.method() === 'pickup' && this.point() === ALL_POINTS,
  );

  constructor() {
    // La colonne s'ouvre sur « Maintenant » (A8, B8) — une fois, au premier rendu qui le porte.
    afterRenderEffect(() => {
      if (this.items().some((item) => item.kind === 'now') && !this.placedOnNow) {
        this.placedOnNow = true;
        this.host.nativeElement.querySelector('[data-now]')?.scrollIntoView?.({ block: 'start' });
      }
    });
  }

  protected track(item: SlotItem): string {
    return item.kind === 'group' ? item.group.key : item.kind;
  }

  /** Repliée : terminée, ni dépliée à la main, ni porteuse d'une occurrence (A5). */
  protected isFolded(group: SlotGroup): boolean {
    const matches = this.matches().references;
    return !this.unfolded().has(group.key) && !group.rows.some((row) => matches.has(row.reference));
  }

  protected toggle(key: string): void {
    this.unfolded.update((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  protected foldedCount(group: SlotGroup): string {
    return `${countLabel(group.handedOver, 'remise', 'remises')} sur ${String(group.expected)} · tout est parti`;
  }

  protected groupCount(group: SlotGroup): string {
    const expected = countLabel(group.expected, 'attendue', 'attendues');
    if (group.handedOver === 0) {
      return expected;
    }
    const done = this.method() === 'pickup' ? ['retirée', 'retirées'] : ['livrée', 'livrées'];
    return `${expected} · ${countLabel(group.handedOver, done[0] ?? '', done[1] ?? '')}`;
  }

  /**
   * Une commande retenue le dit d'abord (`plan-controle-qualite.md`, D7) ; le
   * reste de la sous-ligne suit, pour ne rien perdre de son créneau.
   */
  /**
   * La sous-ligne d'une commande, **dans les mots de la maquette** (Supervision
   * v2, Hugo le 2026-09-28 : « les mêmes phrases que dans la démo ») : ce qui
   * s'est passé et quand, puis, s'il y a un dépassement, qui l'a causé.
   */
  protected subLine(row: SlotRow): string {
    if (row.heldForQuality && row.state !== 'handed_over') {
      return 'Retenue · contrôle qualité bloquant';
    }
    const late = row.overdueMinutes === null ? '' : `, ${durationLabel(row.overdueMinutes)}`;
    switch (row.state) {
      case 'handed_over': {
        const verb = row.method === 'pickup' ? 'Remis' : 'Livrée';
        return row.handedOverAt === null ? verb : `${verb} ${row.handedOverAt}`;
      }
      case 'cancelled':
        return 'Annulée';
      case 'overdue':
        return row.overdueCause === 'customer'
          ? `${this.readyLine(row)} · client pas venu${late}`
          : `Pas prête · créneau dépassé par nous${late}`;
      case 'not_ready':
        return 'Au colisage';
      case 'ready':
        return this.readyLine(row);
    }
  }

  private readyLine(row: SlotRow): string {
    return row.readyAt === null ? 'Prête' : `Prête depuis ${row.readyAt}`;
  }

  /** Le renvoi remplace « Remettre » : seulement là où la maquette le posait, au retrait. */
  protected linksTo(row: SlotRow): boolean {
    return (
      this.showLinks() &&
      row.method === 'pickup' &&
      (row.state === 'ready' || row.state === 'overdue')
    );
  }
}
