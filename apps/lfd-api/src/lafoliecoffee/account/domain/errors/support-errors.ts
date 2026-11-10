import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";

/** La demande de support visée n'existe pas (404). */
export class SupportRequestNotFoundError extends ResourceNotFoundError {
  constructor(readonly supportRequestId: string) {
    super("account.support.not_found", `Demande de support « ${supportRequestId} » introuvable.`);
  }
}
