import type { ContactSubjectPayload } from "@lfd/contracts";

/** Remplacer le réglage entier d'un objet de « Nous écrire ». */
export class ReviseContactSubjectCommand {
  constructor(
    readonly subjectId: string,
    readonly payload: ContactSubjectPayload,
  ) {}
}
