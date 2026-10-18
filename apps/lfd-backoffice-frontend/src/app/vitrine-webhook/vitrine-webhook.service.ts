import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateVitrineSubscriberPayload,
  VitrineContent,
  VitrineCredentialsView,
  VitrineDeliveryView,
  VitrineSubscriberView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les abonnés du webhook de la vitrine** — l'agence du site vitrine et ses
 * envois (`documentation/webhooks/plan-webhook-vitrine.md`), sous
 * `shop_vitrine`. Le secret et la clé ne reviennent qu'à la création et à la
 * rotation : aucune lecture ne les rend.
 */
@Injectable({ providedIn: 'root' })
export class VitrineWebhookService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/vitrine`;

  list(): Promise<readonly VitrineSubscriberView[]> {
    return firstValueFrom(this.http.get<VitrineSubscriberView[]>(`${this.base}/subscribers`));
  }

  create(payload: CreateVitrineSubscriberPayload): Promise<VitrineCredentialsView> {
    return firstValueFrom(
      this.http.post<VitrineCredentialsView>(`${this.base}/subscribers`, payload),
    );
  }

  setContents(id: string, contents: readonly VitrineContent[]): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.subscriber(id)}/contents`, { contents: [...contents] }),
    );
  }

  setActive(id: string, active: boolean): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.subscriber(id)}/active`, { active }));
  }

  rotate(id: string): Promise<VitrineCredentialsView> {
    return firstValueFrom(
      this.http.post<VitrineCredentialsView>(`${this.subscriber(id)}/rotate`, null),
    );
  }

  resync(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.subscriber(id)}/resync`, null));
  }

  test(id: string): Promise<void> {
    return firstValueFrom(this.http.post<unknown>(`${this.subscriber(id)}/test`, null)).then(
      () => undefined,
    );
  }

  deliveries(id: string): Promise<readonly VitrineDeliveryView[]> {
    return firstValueFrom(
      this.http.get<VitrineDeliveryView[]>(`${this.subscriber(id)}/deliveries`),
    );
  }

  resend(deliveryId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.base}/deliveries/${encodeURIComponent(deliveryId)}/resend`,
        null,
      ),
    );
  }

  private subscriber(id: string): string {
    return `${this.base}/subscribers/${encodeURIComponent(id)}`;
  }
}
