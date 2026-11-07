import { AsyncLocalStorage } from "node:async_hooks";

/** Ce qu'un envoi retient de sa composition. */
interface CompositionRecord {
  documentVersion: number | null;
}

const composition = new AsyncLocalStorage<CompositionRecord>();

/**
 * **Quelle version publiée a composé cet envoi ?** (plan
 * `plan-editeur-par-blocs.md`, § 5, S4c : « chaque envoi garde la version
 * qui l'a composé »). Le mailer qui applique le document publié
 * (`EffectiveCopyMailer`) la note ici ; l'envoi du bloc la relit et la range
 * sur la demande. Un périmètre plutôt qu'un retour : la signature `Mailer`
 * de `@lfd/mailer` ne connaît pas les documents, et n'a pas à les connaître.
 *
 * `null` : le document de départ — aucun document publié, ou un document
 * illisible (l'e-mail est parti dans l'ordre du code).
 */
export async function composeMail<T>(
  run: () => Promise<T>,
): Promise<{ readonly result: T; readonly documentVersion: number | null }> {
  const record: CompositionRecord = { documentVersion: null };
  const result = await composition.run(record, run);
  return { result, documentVersion: record.documentVersion };
}

/** Note la version du document publié qui compose l'envoi en cours, s'il est suivi. */
export function noteComposingDocument(version: number): void {
  const record = composition.getStore();
  if (record !== undefined) {
    record.documentVersion = version;
  }
}
