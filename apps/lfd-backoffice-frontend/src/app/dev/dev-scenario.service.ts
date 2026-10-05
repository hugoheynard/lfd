import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  DevScenarioNextReport,
  DevScenarioResetReport,
  DevScenarioView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const URL = `${B2B_API_BASE}/admin/dev/scenario`;

/**
 * **La journée de démo, étape par étape** (2026-10-05,
 * `documentation/order/plan-jeu-de-donnees-par-etapes.md` §2–§3).
 *
 * Store à signal : l'étape atteinte est DÉDUITE de la base par le serveur, et
 * l'écran la relit après chaque geste — réussi ou non. Un échec laisse donc à
 * l'écran l'étape réellement atteinte, jamais celle qu'il croyait jouer.
 *
 * ⚠️ N'existe que dans un build de développement, comme la page qui le lit
 * (cf. `dev-tools.ts`).
 */
@Injectable({ providedIn: 'root' })
export class DevScenarioService {
  private readonly http = inject(HttpClient);

  readonly view = signal<DevScenarioView | null>(null);
  /** Pourquoi `view` est vide quand elle l'est — le vide qui ment (CLAUDE.md du back-office). */
  readonly loadError = signal<unknown>(null);

  /** Relit l'état. L'échec est relancé ET retenu dans `loadError`. */
  async refresh(): Promise<void> {
    try {
      this.view.set(await firstValueFrom(this.http.get<DevScenarioView>(URL)));
      this.loadError.set(null);
    } catch (error: unknown) {
      this.loadError.set(error);
      throw error;
    }
  }

  /** Joue UNE étape, puis relit — y compris après un refus. Le refus est relancé. */
  async next(): Promise<DevScenarioNextReport> {
    try {
      return await firstValueFrom(this.http.post<DevScenarioNextReport>(`${URL}/next`, {}));
    } finally {
      await this.refreshQuietly();
    }
  }

  /** Remet la journée à l'état de base, puis relit. Le refus est relancé. */
  async reset(): Promise<DevScenarioResetReport> {
    try {
      return await firstValueFrom(this.http.post<DevScenarioResetReport>(`${URL}/reset`, {}));
    } finally {
      await this.refreshQuietly();
    }
  }

  /**
   * La relecture qui suit un geste : son échec ne masque pas celui du geste,
   * qui est l'information utile — il reste visible dans `loadError`.
   */
  private async refreshQuietly(): Promise<void> {
    try {
      await this.refresh();
    } catch {
      // Retenu dans `loadError` par `refresh` : l'écran le montre.
    }
  }
}
