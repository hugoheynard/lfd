import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ProductionBatchView,
  ProductionDueThresholdsView,
  ProductionForecastView,
  ProductionPlanClosure,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Ce que le **labo** doit fabriquer pour une journée de service.
 *
 * Aucun état : l'écran demande un jour, obtient un lot, l'imprime. Garder le
 * dernier lot en mémoire ferait imprimer hier au premier clic distrait.
 */
@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly http = inject(HttpClient);

  /**
   * Le **prévisionnel** d'une plage de jours de service, bornes comprises.
   *
   * Une seule lecture pour toute la plage, et pas un lot par jour : la question
   * n'est pas « que fabrique-t-on », mais « quand est-ce que ça tombe ». Sept
   * appels rendraient sept réponses qu'il faudrait recoller ici, et le pic —
   * qui vient du serveur exprès — n'en ferait plus partie.
   */
  async forecast(from: string, to: string): Promise<ProductionForecastView> {
    return firstValueFrom(
      this.http.get<ProductionForecastView>(
        `${B2B_API_BASE}/admin/production/forecast?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    );
  }

  /**
   * **Arrête le plan** d'une journée de service : ses commandes s'inscrivent
   * chez la production, et le compte à produire est figé.
   *
   * 🔴 **La route existait depuis le début et n'était appelée de NULLE PART**
   * hors des e2e (vérifié le 2026-09-13). Le compte à produire était donc vide
   * en exploitation, et la fiche d'atelier n'aurait jamais eu d'heure de
   * tirage : elle aurait affiché la demande du commerce tous les matins, sans
   * que rien ne dise qu'il manquait un geste.
   *
   * Rejouable : une seconde clôture ne recalcule rien — le compte est un
   * instantané — mais republie le fait, ce dont le commerce a besoin si son
   * abonné a échoué. `alreadyClosed` dit laquelle des deux choses est arrivée.
   */
  async closeDay(date: string): Promise<ProductionPlanClosure> {
    return firstValueFrom(
      this.http.post<ProductionPlanClosure>(
        `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}/close`,
        {},
      ),
    );
  }

  /**
   * **Le dossier du jour en PDF** (`AAAA-MM-JJ`) — le papier figé à l'arrêt du
   * plan et archivé par le serveur : récapitulatif, puis un bon par commande.
   *
   * En `Blob` par `HttpClient` et non par un lien : la route exige le jeton, et
   * un `<a href>` partirait sans lui. Refusée en 409 tant que la journée n'est
   * pas arrêtée — il n'y a encore rien de figé à rendre.
   */
  async dossierPdf(date: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}/dossier.pdf`,
        { responseType: 'blob' },
      ),
    );
  }

  /** Le lot d'une journée de service (`AAAA-MM-JJ`). */
  async batch(date: string): Promise<ProductionBatchView> {
    return firstValueFrom(
      this.http.get<ProductionBatchView>(
        `${B2B_API_BASE}/admin/production/batch?date=${encodeURIComponent(date)}`,
      ),
    );
  }

  /**
   * Le **compte à rebours** d'une journée (`AAAA-MM-JJ`) : par produit, ce qui
   * doit être sorti avant chaque échéance, cumulé. Lecture seule, une
   * prévision — plan `production/plan-production-par-vagues.md`, V0.
   */
  async dueThresholds(date: string): Promise<ProductionDueThresholdsView> {
    return firstValueFrom(
      this.http.get<ProductionDueThresholdsView>(
        `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}/due-thresholds`,
      ),
    );
  }
}
