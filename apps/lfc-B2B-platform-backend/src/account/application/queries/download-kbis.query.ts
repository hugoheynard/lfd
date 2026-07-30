/** Télécharge le KBIS d'une entreprise (ouvert à tout membre). */
export class DownloadKbisQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}

/** Le fichier prêt à servir : de quoi poser les en-têtes et écrire le corps. */
export interface KbisDownload {
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}
