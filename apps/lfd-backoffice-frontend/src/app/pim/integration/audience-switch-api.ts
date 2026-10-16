import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AudienceSwitchAppliedView,
  AudienceSwitchPreviewView,
  ReemissionReportView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Les trois routes de la bascule du catalogue vers les faits (lot 2b,
 * `documentation/ops/runbook.md`) — sous `/pim/channels/b2b`.
 */
@Injectable({ providedIn: 'root' })
export class AudienceSwitchApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/channels/b2b`;

  /** Lecture seule — `pim_catalog:read`. */
  preview(): Promise<AudienceSwitchPreviewView> {
    return firstValueFrom(
      this.http.get<AudienceSwitchPreviewView>(`${this.base}/audience-switch-preview`),
    );
  }

  /** Désactive les fiches publiées invisibles — `pim_catalog:write`, geste de publication. */
  apply(): Promise<AudienceSwitchAppliedView> {
    return firstValueFrom(
      this.http.post<AudienceSwitchAppliedView>(`${this.base}/audience-switch`, {}),
    );
  }

  /** Tout (`productId` absent), ou une fiche — `pim_channels:write`, geste de publication. */
  reemit(productId?: string): Promise<ReemissionReportView> {
    return firstValueFrom(
      this.http.post<ReemissionReportView>(
        `${this.base}/reemit`,
        productId === undefined ? {} : { productId },
      ),
    );
  }
}
