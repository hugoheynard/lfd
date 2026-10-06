import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CloseStopWithoutHandoverPayload,
  DepartDeliveryRoundPayload,
  DeliveryIncidentFamily,
  MyDeliveryRoundsView,
  MyDeliveryRoundView,
  ReportedDeliveryIncidentResponse,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const MY_ROUND = `${B2B_API_BASE}/admin/livraison/ma-tournee`;

function roundUrl(roundId: string): string {
  return `${MY_ROUND}/${encodeURIComponent(roundId)}`;
}

function stopUrl(roundId: string, stopId: string): string {
  return `${roundUrl(roundId)}/arrets/${encodeURIComponent(stopId)}`;
}

/** Un signalement, tel que l'écran le compose (`a-la-porte.md`, § 3). */
export interface IncidentReport {
  readonly family: DeliveryIncidentFamily;
  readonly reason: string;
  readonly note: string;
  /** L'arrêt concerné, ou `null` : la tournée seule. */
  readonly stopId: string | null;
  /** Prise par l'appareil, facultative. */
  readonly photo: Blob | null;
}

/** Une remise au client, telle que l'écran la compose (`a-la-porte.md`, B1). */
export interface DoorstepHandover {
  /** La version de la tournée lue par l'écran. */
  readonly version: number;
  readonly receiverName: string;
  /** Prise par l'appareil — toujours. */
  readonly photo: Blob;
  /** Le tracé au doigt, en PNG ; `null` quand il n'est pas exigé et pas fait. */
  readonly signature: Blob | null;
}

/** Un dépôt avec preuve, tel que l'écran le compose (`a-la-porte.md`, B2). */
export interface DoorstepDeposit {
  /** La version de la tournée lue par l'écran. */
  readonly version: number;
  /** Prise par l'appareil — toujours : c'est la seule preuve du dépôt. */
  readonly photo: Blob;
}

/**
 * **« Ma tournée »** (`plan-ma-tournee.md`, MT-D4), sous `delivery_driving`.
 *
 * Le livreur n'est jamais un paramètre : c'est la personne connectée, et le
 * serveur la met dans le `where`. Une tournée d'un autre rend 404.
 */
@Injectable({ providedIn: 'root' })
export class MyDeliveryRoundService {
  private readonly http = inject(HttpClient);

  mine(date: string): Promise<MyDeliveryRoundsView> {
    return firstValueFrom(
      this.http.get<MyDeliveryRoundsView>(`${MY_ROUND}?date=${encodeURIComponent(date)}`),
    );
  }

  round(roundId: string): Promise<MyDeliveryRoundView> {
    return firstValueFrom(
      this.http.get<MyDeliveryRoundView>(`${MY_ROUND}/${encodeURIComponent(roundId)}`),
    );
  }

  /** « Commencer ma tournée », avec la version lue : une tournée modifiée entre-temps est refusée. */
  async depart(roundId: string, payload: DepartDeliveryRoundPayload): Promise<void> {
    await firstValueFrom(
      this.http.post(`${MY_ROUND}/${encodeURIComponent(roundId)}/depart`, payload),
    );
  }

  /**
   * La photo d'une étape de procédure d'un de MES arrêts, en blob : un
   * `<img src>` nu n'enverrait pas le jeton. `rev` dans l'URL : la route répond
   * `immutable`, et c'est la révision qui fait d'une photo remplacée une autre
   * ressource pour le cache.
   */
  stepPhoto(roundId: string, stopId: string, stepId: string, revision: string): Promise<Blob> {
    const path = [roundId, 'arrets', stopId, 'procedure', stepId, 'photo']
      .map((part) => encodeURIComponent(part))
      .join('/');
    return firstValueFrom(
      this.http.get(`${MY_ROUND}/${path}`, { params: { rev: revision }, responseType: 'blob' }),
    );
  }

  // ── À la porte (`a-la-porte.md`, lot A), sous `delivery_doorstep` ──

  /** « Je suis arrivé » — rejouée, la route répond pareil. */
  async arrive(roundId: string, stopId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/arrivee`, null));
  }

  /** « Déclarer un problème » — en multipart, la photo sous `photo`. */
  async report(roundId: string, report: IncidentReport): Promise<string> {
    const body = new FormData();
    body.append('family', report.family);
    body.append('reason', report.reason);
    body.append('note', report.note);
    if (report.stopId !== null) {
      body.append('stopId', report.stopId);
    }
    if (report.photo !== null) {
      body.append('photo', report.photo, 'signalement.jpg');
    }
    const created = await firstValueFrom(
      this.http.post<ReportedDeliveryIncidentResponse>(`${roundUrl(roundId)}/incidents`, body),
    );
    return created.id;
  }

  /** Clore l'arrêt sans remise — la commande est déjà retirée, ou annulée (AP-D2). */
  async closeWithoutHandover(
    roundId: string,
    stopId: string,
    payload: CloseStopWithoutHandoverPayload,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(`${stopUrl(roundId, stopId)}/cloture-sans-remise`, payload),
    );
  }

  /**
   * « Remis au client » (B1) — en multipart : la photo sous `photo`, la
   * signature sous `signature`. Rejouée, la route répond pareil.
   */
  async handOver(roundId: string, stopId: string, handover: DoorstepHandover): Promise<void> {
    const body = new FormData();
    body.append('version', String(handover.version));
    body.append('receiverName', handover.receiverName);
    body.append('photo', handover.photo, 'remise.jpg');
    if (handover.signature !== null) {
      body.append('signature', handover.signature, 'signature.png');
    }
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/remise`, body));
  }

  /**
   * « Déposé avec preuve » (B2) — en multipart : la photo sous `photo`. Le
   * serveur refuse si l'arrêt ne l'autorise pas. Rejouée, la route répond pareil.
   */
  async deposit(roundId: string, stopId: string, deposit: DoorstepDeposit): Promise<void> {
    const body = new FormData();
    body.append('version', String(deposit.version));
    body.append('photo', deposit.photo, 'depot.jpg');
    await firstValueFrom(this.http.post(`${stopUrl(roundId, stopId)}/depot`, body));
  }

  /** « Tournée terminée » (PL2) — rejouée, la route répond pareil. */
  async returnToDepot(roundId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${roundUrl(roundId)}/retour`, null));
  }

  /** La photo d'un signalement de MA tournée, en blob : un `<img src>` nu n'enverrait pas le jeton. */
  incidentPhoto(roundId: string, incidentId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${roundUrl(roundId)}/incidents/${encodeURIComponent(incidentId)}/photo`, {
        responseType: 'blob',
      }),
    );
  }
}
