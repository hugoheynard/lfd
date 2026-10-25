import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CustomerNudgesView, FulfillmentMethod } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../../commandes/orders.service';
import { NotifyService } from '../../notify.service';
import { rowNudgeOf, type RowNudge } from '../customer-nudges';
import { ALL_POINTS, atPoint, slotLayout } from '../handover-layout';
import type { SlotItem } from '../handover-layout';
import { UNPLACED_LINE } from '../handover-slots';
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
 * vers le retrait, qui opère. Une exception, voulue par Hugo le 2026-10-25 :
 * **les relances d'un retrait en retard** ont quitté le comptoir pour la
 * supervision — relancer un client est une décision de superviseur, pas un
 * geste de comptoir. Deux gestes selon qui est en retard, jamais les deux à
 * la fois (`rowNudgeOf`) : « Rappel au client » (prête, pas venu) et
 * « Avertir le client » (pas prête), chacun une fois par commande, passé son
 * délai après la fin du créneau. La tournée de la maquette n'a pas de donnée
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
  /** Les relances du jour — délais et traces ; `null` tant qu'elles ne sont pas lues. */
  readonly nudges = input<CustomerNudgesView | null>(null);
  /** Une relance vient de partir : la page relit les traces. */
  readonly nudged = output();

  protected readonly link = SUPERVISION_LINKS.handover;
  protected readonly unplaced = UNPLACED_LINE;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly orders = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * `POST /admin/orders/:id/pickup-reminder` et `…/delay-warning` exigent
   * `b2b_orders:write` : sans lui, aucun bouton ne promet un 403 — la trace,
   * elle, se lit quand même.
   */
  protected readonly canNudge = computed(() => this.permissions.can('b2b_orders:write'));

  /** La commande dont la relance est en vol — au plus une, et le bouton le dit. */
  protected readonly nudgingId = signal<string | null>(null);

  /**
   * Les relances parties depuis cet écran, en attendant que la relecture des
   * traces les rende (« … par … ») : le bouton ne se réarme pas entre-temps.
   * Le serveur, lui, refuse de toute façon un second envoi.
   */
  protected readonly justSent = signal<ReadonlySet<string>>(new Set());

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
        return this.deliveryLine(row) ?? this.readyLine(row);
    }
  }

  /**
   * Prête, une livraison avance encore (Hugo, 2026-10-25) : chargée dans la
   * camionnette, puis partie. `null` au retrait, ou tant qu'elle est au sac.
   */
  private deliveryLine(row: SlotRow): string | null {
    if (row.method !== 'delivery') {
      return null;
    }
    if (row.departedAt !== null) {
      return `Partie à ${row.departedAt}`;
    }
    return row.loaded ? 'Chargée' : null;
  }

  private readyLine(row: SlotRow): string {
    return row.readyAt === null ? 'Prête' : `Prête depuis ${row.readyAt}`;
  }

  /**
   * La relance d'une ligne : le bon bouton, la trace, ou rien. Le bouton
   * suppose le droit d'écrire ; une relance partie d'ici se dit « envoyée »
   * jusqu'à ce que la trace relue la nomme.
   */
  protected nudgeOf(row: SlotRow): RowNudge | null {
    const nudge = rowNudgeOf(row, this.nudges());
    if (nudge === null || nudge.kind === 'sent') {
      return nudge;
    }
    if (this.justSent().has(row.orderId)) {
      return { kind: 'sent', label: nudge.kind === 'remind' ? 'Rappel envoyé' : 'Client averti' };
    }
    return this.canNudge() ? nudge : null;
  }

  /**
   * « Rappel au client » (le courriel de retrait, avec le QR) ou « Avertir le
   * client » (« Votre commande prend du retard ») — puis la page relit les traces.
   */
  protected async nudge(row: SlotRow, kind: 'remind' | 'warn'): Promise<void> {
    this.nudgingId.set(row.orderId);
    try {
      await (kind === 'remind'
        ? this.orders.remindHandover(row.orderId)
        : this.orders.warnOfDelay(row.orderId));
      this.justSent.update((sent) => new Set([...sent, row.orderId]));
      this.notify.success(
        kind === 'remind'
          ? `Rappel envoyé pour ${row.reference}.`
          : `Client averti du retard de ${row.reference}.`,
      );
      this.nudged.emit();
    } catch (caught) {
      this.notify.error(
        caught,
        kind === 'remind'
          ? "Le rappel n'a pas pu être envoyé."
          : "L'avertissement n'a pas pu être envoyé.",
      );
    } finally {
      this.nudgingId.set(null);
    }
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
