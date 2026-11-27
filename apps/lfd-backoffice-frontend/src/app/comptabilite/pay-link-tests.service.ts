import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatePayLinkTestPayload,
  CreatedPayLinkTest,
  PayLinkTestRecipient,
  PayLinkTestView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

/**
 * **Le lien de paiement d'essai** (plan
 * `documentation/payment/les-liens-de-paiement.md`, § 4 bis), sous le droit
 * `pay_link_test` : 1 € encaissé puis remboursé, envoyé à un membre du staff.
 */
@Injectable({ providedIn: 'root' })
export class PayLinkTestsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/payment/link-tests`;

  list(): Promise<readonly PayLinkTestView[]> {
    return firstValueFrom(this.http.get<readonly PayLinkTestView[]>(this.base));
  }

  /** Les membres actifs du staff qu'un essai peut viser, sous `pay_link_test:read`. */
  recipients(): Promise<readonly PayLinkTestRecipient[]> {
    return firstValueFrom(
      this.http.get<readonly PayLinkTestRecipient[]>(`${this.base}/recipients`),
    );
  }

  /** Une fois par intention : la même clé rend le même essai. */
  create(payload: CreatePayLinkTestPayload, intentKey: string): Promise<CreatedPayLinkTest> {
    return firstValueFrom(
      this.http.post<CreatedPayLinkTest>(this.base, payload, intentOptions(intentKey)),
    );
  }
}
