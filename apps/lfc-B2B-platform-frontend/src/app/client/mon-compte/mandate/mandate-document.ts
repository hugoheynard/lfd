import type { ClientMandate } from '../../client-mandate.service';

/** Le temps laissé à l'onglet ou au téléchargement pour lire le blob avant de le libérer. */
const OBJECT_URL_TTL_MS = 60_000;

/**
 * Ouvre le mandat à signer dans un nouvel onglet. Même geste que le KBIS
 * (`KbisPanel`) : un blob lu avec le jeton, jamais un lien nu.
 *
 * Rend `false` si la lecture échoue, pour que l'appelant le dise.
 */
export function openMandate(mandates: ClientMandate, companyId: string): Promise<boolean> {
  return withBlob(mandates.document(companyId, true), (url) =>
    window.open(url, '_blank', 'noopener'),
  );
}

/** Télécharge le mandat à signer, nommé d'après sa RUM. */
export function downloadMandate(
  mandates: ClientMandate,
  companyId: string,
  reference: string,
): Promise<boolean> {
  return withBlob(mandates.document(companyId, false), (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `mandat-sepa-${reference}.pdf`;
    link.click();
  });
}

async function withBlob(read: Promise<Blob>, use: (objectUrl: string) => void): Promise<boolean> {
  try {
    const url = URL.createObjectURL(await read);
    use(url);
    setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
    return true;
  } catch {
    return false;
  }
}
