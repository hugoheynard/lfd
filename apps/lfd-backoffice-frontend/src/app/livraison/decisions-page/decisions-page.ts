import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PendingStopDecisionView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DoorstepRuleCard } from '../doorstep-rule-card/doorstep-rule-card';
import { incidentSubtitleOf, incidentTitleOf } from '../delivery-incidents';
import { IncidentPhoto, type IncidentPhotoLoader } from '../incident-photo/incident-photo';
import { roundLabel, serviceDayLabel } from '../delivery-rounds';
import { decisionStatusOf } from '../stop-decisions';
import { StopDecisionsService } from '../stop-decisions.service';

type DecisionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly decisions: readonly PendingStopDecisionView[] };

/** Un refus du serveur, sur la carte de l'arrêt qui l'a reçu. */
interface Refusal {
  readonly stopId: string;
  readonly message: string;
}

/**
 * **« À décider »** (`documentation/livraisons/a-la-porte.md`, B3, B5) —
 * les arrêts où le livreur a signalé que le client ne respecte pas les
 * conditions convenues : personne, refus, accès impossible. Le commercial
 * répond « Autoriser le dépôt cette fois » (même signature exigée, LB-Q5) ou
 * « Rapporter » (l'arrêt se clôt, la commande repart un autre jour, LB-Q2).
 *
 * Le livreur continue sa tournée sans attendre : une autorisation qui arrive
 * pendant qu'il est encore sur place lui ouvre « Déposé avec preuve ». La
 * dernière réponse l'emporte tant qu'il n'a pas déposé ; le serveur refuse
 * le reste, et son refus s'affiche sur la carte.
 *
 * En tête, la décision réglée d'avance à la porte (B3 bis) : déplacée ici le
 * 2026-10-02 depuis « Point de départ » — Hugo : « c'est lui qui supervise les
 * termes et conditions pour les livreurs ». Lue avec `delivery_procedures:read`,
 * modifiable avec `:write` ; absente sans le droit de lecture (la route
 * répondrait 403).
 */
@Component({
  selector: 'app-decisions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    IncidentPhoto,
    DoorstepRuleCard,
  ],
  templateUrl: './decisions-page.html',
  styleUrl: './decisions-page.scss',
})
export class DecisionsPage {
  private readonly service = inject(StopDecisionsService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canReadDoorstepRule = computed(() =>
    this.permissions.can('delivery_procedures:read'),
  );
  protected readonly canWriteDoorstepRule = computed(() =>
    this.permissions.can('delivery_procedures:write'),
  );

  protected readonly state = signal<DecisionsState>({ status: 'loading' });
  protected readonly decisions = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.decisions : [];
  });
  /** L'arrêt dont une réponse est en vol — un geste à la fois. */
  protected readonly busy = signal<string | null>(null);
  protected readonly refusal = signal<Refusal | null>(null);

  /**
   * La photo d'un signalement, par la route murée des commerciaux : elle ne
   * sert que celle d'un signalement de CET arrêt sous une décision vivante.
   */
  protected readonly incidentPhoto: IncidentPhotoLoader = (incidentId) =>
    this.service.photo(this.stopOfIncident(incidentId), incidentId);
  protected readonly statusOf = decisionStatusOf;
  protected readonly incidentTitleOf = incidentTitleOf;
  protected readonly incidentSubtitleOf = incidentSubtitleOf;

  constructor() {
    void this.load();
  }

  /** « Kangoo · passage 2 · mardi 29 septembre » */
  protected roundOf(decision: PendingStopDecisionView): string {
    return `${roundLabel(decision)} · ${serviceDayLabel(decision.serviceDay)}`;
  }

  protected titleOf(decision: PendingStopDecisionView): string {
    const reference = decision.reference === '' ? decision.orderId : decision.reference;
    return decision.customerLabel === '' ? reference : `${reference} · ${decision.customerLabel}`;
  }

  protected refusalOf(stopId: string): string | null {
    const refusal = this.refusal();
    return refusal?.stopId === stopId ? refusal.message : null;
  }

  private stopOfIncident(incidentId: string): string {
    const found = this.decisions().find((decision) =>
      decision.incidents.some((incident) => incident.id === incidentId),
    );
    return found?.stopId ?? '';
  }

  protected retry(): void {
    void this.load();
  }

  protected authorize(stopId: string): void {
    void this.answer(stopId, () => this.service.authorizeDeposit(stopId));
  }

  protected bringBack(stopId: string): void {
    void this.answer(stopId, () => this.service.bringBack(stopId));
  }

  /** Répond, puis relit la liste ; un refus reste sur la carte, la liste aussi. */
  private async answer(stopId: string, send: () => Promise<void>): Promise<void> {
    this.busy.set(stopId);
    this.refusal.set(null);
    try {
      await send();
      await this.load(false);
    } catch (error) {
      this.refusal.set({
        stopId,
        message: httpErrorMessage(error, 'La décision n’a pas pu être enregistrée.'),
      });
    } finally {
      this.busy.set(null);
    }
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) {
      this.state.set({ status: 'loading' });
    }
    try {
      const { decisions } = await this.service.pending();
      this.state.set({ status: 'ready', decisions });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
