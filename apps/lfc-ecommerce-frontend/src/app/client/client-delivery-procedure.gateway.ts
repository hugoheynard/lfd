import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, type Provider } from '@angular/core';
import {
  DeliveryProcedureConflictError,
  DeliveryProcedureGateway,
  DeliveryProcedureWriteError,
  type DeliveryStepPhotoChange,
} from '@lfd/b2b-ui/company';
import type {
  CreatedDeliveryStepResponse,
  DeliveryProcedureOrderPayload,
  DeliveryProcedureView,
  DeliveryStepFields,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Le statut d'une procédure qui a changé sous l'écran (ordre périmé, plan §2.5). */
const CONFLICT = 409;

/**
 * La procédure de livraison vue du **client** : `/companies/:companyId/…`,
 * murée par l'adhésion — lecture pour tout membre, écriture au gestionnaire
 * (plan `procedure-de-livraison` §2.4).
 *
 * Plain class plutôt qu'`@Injectable` : elle naît par
 * {@link clientDeliveryProcedureGateway}, dans les `providers` du dialogue qui
 * l'ouvre, liée à la société de ce dialogue. L'éditeur partagé ne parle que
 * d'adresse.
 *
 * Le jeton est redemandé à chaque appel, comme `ClientAddresses` : la façade le
 * renouvelle, une copie gardée ici périmerait.
 */
export class ClientDeliveryProcedureGateway extends DeliveryProcedureGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthFacade,
    private readonly companyId: string,
  ) {
    super();
  }

  load(addressId: string): Promise<DeliveryProcedureView> {
    return this.send((headers) =>
      this.http.get<DeliveryProcedureView>(this.procedureUrl(addressId), { headers }),
    );
  }

  async addStep(
    addressId: string,
    fields: DeliveryStepFields,
    photo: Blob | null,
  ): Promise<string> {
    const body = stepForm(fields, photo);
    const created = await this.send((headers) =>
      this.http.post<CreatedDeliveryStepResponse>(`${this.procedureUrl(addressId)}/steps`, body, {
        headers,
      }),
    );
    return created.id;
  }

  async reviseStep(
    addressId: string,
    stepId: string,
    fields: DeliveryStepFields,
    change: DeliveryStepPhotoChange,
  ): Promise<void> {
    const body = stepForm(fields, change.kind === 'replace' ? change.photo : null);
    body.append('removePhoto', change.kind === 'remove' ? 'true' : 'false');
    await this.send((headers) =>
      this.http.patch<void>(this.stepUrl(addressId, stepId), body, { headers }),
    );
  }

  async removeStep(addressId: string, stepId: string): Promise<void> {
    await this.send((headers) =>
      this.http.delete<void>(this.stepUrl(addressId, stepId), { headers }),
    );
  }

  async reorder(addressId: string, stepIds: readonly string[]): Promise<void> {
    const payload: DeliveryProcedureOrderPayload = { stepIds: [...stepIds] };
    await this.send((headers) =>
      this.http.put<void>(`${this.procedureUrl(addressId)}/order`, payload, { headers }),
    );
  }

  photo(addressId: string, stepId: string, revision: string): Promise<Blob> {
    // `rev` dans l'URL : la route sert une réponse `immutable`, et c'est la
    // révision qui fait d'une photo remplacée une autre ressource pour le cache.
    return this.send((headers) =>
      this.http.get(`${this.stepUrl(addressId, stepId)}/photo`, {
        headers,
        params: { rev: revision },
        responseType: 'blob',
      }),
    );
  }

  private procedureUrl(addressId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${this.companyId}/delivery-addresses/${addressId}/procedure`;
  }

  private stepUrl(addressId: string, stepId: string): string {
    return `${this.procedureUrl(addressId)}/steps/${stepId}`;
  }

  /** Porte le jeton, et traduit un échec dans les deux erreurs que le port déclare. */
  private async send<T>(call: (headers: HttpHeaders) => Observable<T>): Promise<T> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      return await firstValueFrom(call(new HttpHeaders({ Authorization: `Bearer ${token}` })));
    } catch (error) {
      const message = httpErrorMessage(error);
      throw statusOf(error) === CONFLICT
        ? new DeliveryProcedureConflictError(message)
        : new DeliveryProcedureWriteError(message);
    }
  }
}

/** Le fournisseur de la passerelle client pour une société — à passer aux `providers` du dialogue. */
export function clientDeliveryProcedureGateway(companyId: string): Provider {
  return {
    provide: DeliveryProcedureGateway,
    useFactory: () =>
      new ClientDeliveryProcedureGateway(inject(HttpClient), inject(AuthFacade), companyId),
  };
}

/** Les champs d'une étape en multipart ; la photo, si elle est jointe, sous `photo`. */
function stepForm(fields: DeliveryStepFields, photo: Blob | null): FormData {
  const body = new FormData();
  body.append('title', fields.title);
  body.append('body', fields.body);
  if (photo !== null) {
    body.append('photo', photo, 'etape.jpg');
  }
  return body;
}

function statusOf(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : null;
}
