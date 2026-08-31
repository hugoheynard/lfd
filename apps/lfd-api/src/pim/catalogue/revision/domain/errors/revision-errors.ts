import { ResourceNotFoundError } from "../../../../../platform/shared/errors/app-error.js";

/** On compare à une ancre qui n'existe pas. */
export class RevisionNotFoundError extends ResourceNotFoundError {
  constructor(readonly version: number) {
    super("catalogue.revision.not_found", `Révision « v${String(version)} » inconnue.`);
  }
}
