import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { MailSenderPayload, MailSenderView, MailSpace } from '@lfd/mail-blocks';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

const BASE = `${B2B_API_BASE}/admin/mail-senders`;

/**
 * **L'identité d'envoi d'un espace d'e-mails** (`plan-editeur-par-blocs.md`,
 * § 25, C3 — `packages/mail-blocks/src/mail-sender-identity.ts`).
 *
 * Murées côté serveur par le droit `mail_templates` : lire demande `read`,
 * changer demande `write`.
 */
@Injectable({ providedIn: 'root' })
export class MailSendersService {
  private readonly http = inject(HttpClient);

  /** Rien n'est écrit ; Resend est lu pour les domaines vérifiés. `404` : espace inconnu. */
  load(space: MailSpace): Promise<MailSenderView> {
    return firstValueFrom(this.http.get<MailSenderView>(`${BASE}/${space}`));
  }

  /**
   * Un essai part vers l'auteur sous l'identité, puis elle est enregistrée.
   * La clé d'intention est celle de l'écran, renvoyée à chaque clic tant que
   * le geste n'a pas abouti — un double clic n'envoie pas deux essais.
   * `400` forme, `409` domaine non vérifié, essai refusé, révision dépassée.
   */
  async change(space: MailSpace, payload: MailSenderPayload, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.put<unknown>(`${BASE}/${space}`, payload, intentOptions(intentKey)),
    );
  }
}
