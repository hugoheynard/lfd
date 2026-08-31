import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CatalogOverviewView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/** Où en est le catalogue — une lecture, jamais une écriture. */
@Injectable({ providedIn: 'root' })
export class CatalogueOverviewHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  read(): Promise<CatalogOverviewView> {
    return firstValueFrom(
      this.http.get<CatalogOverviewView>(`${this.base}/catalogue/revisions/overview`),
    );
  }
}
