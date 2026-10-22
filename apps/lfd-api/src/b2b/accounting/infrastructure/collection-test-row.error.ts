import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Une ligne `collection_test` que le domaine ne sait pas relire — malgré les CHECK. */
export class CorruptCollectionTestRowError extends TechnicalError {
  constructor(
    readonly testId: string,
    readonly what: string,
  ) {
    super(
      "accounting.collection_test.corrupt_row",
      `L'essai ${testId} est illisible en base (${what}) : il n'a pas été chargé. Le signaler à l'équipe technique.`,
    );
  }
}
