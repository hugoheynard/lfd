import { ResourceNotFoundError } from "../../../../../platform/shared/errors/app-error.js";

/** On compare à une ancre qui n'existe pas. */
export class RevisionNotFoundError extends ResourceNotFoundError {
  constructor(readonly reference: string) {
    super("catalogue.revision.not_found", `Révision « ${reference} » inconnue.`);
  }
}
