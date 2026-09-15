import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { inject, type Provider } from '@angular/core';
import type {
  CreatedDeliveryStepResponse,
  DeliveryProcedureOrderPayload,
  DeliveryProcedureView,
  DeliveryStepFields,
} from '@lfd/contracts';
import {
  DeliveryProcedureConflictError,
  DeliveryProcedureGateway,
  DeliveryProcedureWriteError,
  type DeliveryStepPhotoChange,
} from '@lfd/b2b-ui/company';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/** Le statut d'une procédure qui a changé sous l'écran. */
const CONFLICT = 409;

/**
 * La procédure de livraison vue du **staff** : `/admin/companies/:companyId/…`,
 * sans mur d'adhésion. La société est liée à l'instance ; l'éditeur partagé ne
 * parle que d'adresse.
 *
 * Plain class plutôt qu'`@Injectable` : elle naît par {@link
 * adminDeliveryProcedureGateway}, au plus près du panneau qui l'ouvre, avec la
 * société de ce panneau.
 */
export class AdminDeliveryProcedureGateway extends DeliveryProcedureGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly companyId: string,
  ) {
    super();
  }

  load(addressId: string): Promise<DeliveryProcedureView> {
    return this.send(this.http.get<DeliveryProcedureView>(this.procedureUrl(addressId)));
  }

  async addStep(
    addressId: string,
    fields: DeliveryStepFields,
    photo: Blob | null,
  ): Promise<string> {
    const body = stepForm(fields, photo);
    const created = await this.send(
      this.http.post<CreatedDeliveryStepResponse>(`${this.procedureUrl(addressId)}/steps`, body),
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
    await this.send(this.http.patch<void>(this.stepUrl(addressId, stepId), body));
  }

  async removeStep(addressId: string, stepId: string): Promise<void> {
    await this.send(this.http.delete<void>(this.stepUrl(addressId, stepId)));
  }

  async reorder(addressId: string, stepIds: readonly string[]): Promise<void> {
    const payload: DeliveryProcedureOrderPayload = { stepIds: [...stepIds] };
    await this.send(this.http.put<void>(`${this.procedureUrl(addressId)}/order`, payload));
  }

  photo(addressId: string, stepId: string, revision: string): Promise<Blob> {
    // `rev` dans l'URL : la route sert une réponse `immutable`, et c'est la
    // révision qui fait d'une photo remplacée une autre ressource pour le cache.
    return this.send(
      this.http.get(`${this.stepUrl(addressId, stepId)}/photo`, {
        params: { rev: revision },
        responseType: 'blob',
      }),
    );
  }

  private procedureUrl(addressId: string): string {
    return `${B2B_API_BASE}/admin/companies/${this.companyId}/delivery-addresses/${addressId}/procedure`;
  }

  private stepUrl(addressId: string, stepId: string): string {
    return `${this.procedureUrl(addressId)}/steps/${stepId}`;
  }

  /** Traduit un échec HTTP dans les deux erreurs que le port déclare. */
  private async send<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      const message = httpErrorMessage(error);
      throw isStatus(error, CONFLICT)
        ? new DeliveryProcedureConflictError(message)
        : new DeliveryProcedureWriteError(message);
    }
  }
}

/** Le fournisseur de la passerelle staff pour une société — à passer aux `providers` du panneau. */
export function adminDeliveryProcedureGateway(companyId: string): Provider {
  return {
    provide: DeliveryProcedureGateway,
    useFactory: () => new AdminDeliveryProcedureGateway(inject(HttpClient), companyId),
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

function isStatus(error: unknown, status: number): error is HttpErrorResponse {
  return (
    typeof error === 'object' && error !== null && 'status' in error && error.status === status
  );
}
