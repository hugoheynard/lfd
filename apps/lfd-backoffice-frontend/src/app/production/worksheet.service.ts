import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ProductionWorksheetRetake,
  ProductionWorksheetView,
  RecordWorkshopBatch,
  ReportWorkshopProblem,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

/**
 * La **fiche d'atelier** d'une journée : ce qu'il y a à sortir, et ce qui l'est.
 *
 * Séparé de {@link ProductionService} bien qu'il serve le même fournil : celui-ci
 * lit un lot de commandes pour l'imprimer, celui-là lit un compte à produire et
 * l'**écrit** — deux raisons de changer, et une seule qui porte des gestes.
 *
 * Aucun état gardé ici : la lecture de l'écran vit dans `WorkshopDayReader`.
 */
@Injectable({ providedIn: 'root' })
export class WorksheetService {
  private readonly http = inject(HttpClient);

  /**
   * **La fiche que le four est en train de faire** — demain si son plan est
   * arrêté, aujourd'hui sinon, décidé au SERVEUR avec son horloge (2026-09-14).
   * C'est la seule lecture de la fournée du jour : l'horloge du poste n'est pas
   * une autorité.
   */
  async current(): Promise<ProductionWorksheetView> {
    return firstValueFrom(
      this.http.get<ProductionWorksheetView>(`${B2B_API_BASE}/admin/production/worksheet/current`),
    );
  }

  /** La fiche d'une journée de service (`AAAA-MM-JJ`) — celle d'un lien partagé. */
  async worksheet(date: string): Promise<ProductionWorksheetView> {
    return firstValueFrom(
      this.http.get<ProductionWorksheetView>(
        `${B2B_API_BASE}/admin/production/worksheet?date=${encodeURIComponent(date)}`,
      ),
    );
  }

  /**
   * **Déclare une fournée** d'une ligne — ce que le four vient de sortir.
   *
   * L'`id` est tiré par l'écran : c'est la clé d'idempotence. Le même `id`
   * rejoué avec la même charge rend un succès ; sous une autre charge, le
   * serveur refuse (409) et nomme le conflit.
   */
  async recordBatch(
    date: string,
    sku: string,
    batchId: string,
    payload: RecordWorkshopBatch,
  ): Promise<void> {
    const url = `${this.worksheetUrl(date)}/lines/${encodeURIComponent(sku)}/batches/${encodeURIComponent(batchId)}`;
    await firstValueFrom(this.http.put<void>(url, payload));
  }

  /**
   * **Annule une fournée**, entière. Refusée par le serveur si ses pièces sont
   * déjà au bac — le message dit quoi ressortir.
   */
  async cancelBatch(date: string, batchId: string): Promise<void> {
    const url = `${this.worksheetUrl(date)}/batches/${encodeURIComponent(batchId)}`;
    await firstValueFrom(this.http.delete<void>(url));
  }

  /**
   * **« Fait »** (plan `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.6) :
   * le serveur déclare une fournée du reste sous le plafond. Par intention.
   */
  async markDone(date: string, sku: string, intentKey: string): Promise<void> {
    const url = `${this.worksheetUrl(date)}/lines/${encodeURIComponent(sku)}/done`;
    await firstValueFrom(this.http.post<void>(url, {}, intentOptions(intentKey)));
  }

  /**
   * **Le rouge** (§ 3.4) : combien est réellement sorti. Le serveur pose le
   * plafond, corrige ou complète les fournées, et sonne la cloche. Par intention.
   */
  async reportProblem(
    date: string,
    sku: string,
    payload: ReportWorkshopProblem,
    intentKey: string,
  ): Promise<void> {
    const url = `${this.worksheetUrl(date)}/lines/${encodeURIComponent(sku)}/problem`;
    await firstValueFrom(this.http.post<void>(url, payload, intentOptions(intentKey)));
  }

  /** Le **retirage** : absorber ce qui est arrivé depuis que le plan est arrêté. */
  async retake(date: string): Promise<ProductionWorksheetRetake> {
    return firstValueFrom(
      this.http.post<ProductionWorksheetRetake>(
        `${B2B_API_BASE}/admin/production/worksheet/${encodeURIComponent(date)}/retake`,
        {},
      ),
    );
  }

  private worksheetUrl(date: string): string {
    return `${B2B_API_BASE}/admin/production/worksheet/${encodeURIComponent(date)}`;
  }
}
