import { httpErrorMessage } from '@lfd/endpoints';

/**
 * Le refus du serveur, même quand la réponse attendue était un FICHIER : un
 * 409 sur un `file.csv` arrive en `Blob`, et `httpErrorMessage` n'y lirait
 * rien — or c'est ce message qui nomme les comptes ou les mandats en cause.
 *
 * ⚠️ La carte « Mandats à la banque » en garde une copie privée (vérifié le
 * 2026-10-23) : elle n'a pas été basculée ici pour ne pas toucher un fichier
 * en cours de modification ailleurs.
 */
export async function blobRefusalMessage(error: unknown): Promise<string> {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = error.error;
    if (body instanceof Blob) {
      try {
        const parsed: unknown = JSON.parse(await textOf(body));
        return httpErrorMessage({ error: parsed });
      } catch {
        return httpErrorMessage(error);
      }
    }
  }
  return httpErrorMessage(error);
}

/** `FileReader` plutôt que `Blob.text()` : le second manque à jsdom, où les suites tournent. */
function textOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Réponse illisible.'));
    };
    reader.readAsText(blob);
  });
}
