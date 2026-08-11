import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AlertRule, AlertRuleView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../../api/api-config';

/**
 * Les **réglages globaux d'alerte de compte client** — ce que la plateforme
 * surveille chez tous les comptes, tant qu'aucun ne déroge.
 *
 * Lecture et écriture sont **staff** : le jeton est attaché par
 * `staffAuthInterceptor`, pas ici. L'écriture est une route unique, sans le type
 * dans l'URL — le type est déjà le discriminant des paramètres, et le mettre
 * aussi dans le chemin créerait un désaccord possible entre les deux.
 */
@Injectable({ providedIn: 'root' })
export class AlertRulesService {
  private readonly http = inject(HttpClient);

  /** Tous les types connus, y compris ceux que personne n'a jamais réglés. */
  list(): Promise<AlertRuleView[]> {
    return firstValueFrom(this.http.get<AlertRuleView[]>(`${B2B_API_BASE}/admin/alert-rules`));
  }

  async save(rule: AlertRule): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${B2B_API_BASE}/admin/alert-rules`, rule));
  }
}
