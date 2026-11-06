import { InvalidMailRequestError } from "../errors/mail-request.errors.js";

/** Le champ qu'une demande différée porte à la place de `pdfBase64`. */
export const STORED_PDF_FIELD = "pdfStored";

/** Le champ que le gabarit lit, rempli au moment de l'envoi. */
const PDF_CONTENT_FIELD = "pdfBase64";

/** Les stockages d'où le bloc sait relire une pièce (2026-11-06 : un seul). */
export const MAIL_ATTACHMENT_STORES = ["customer-documents"] as const;

export type MailAttachmentStoreName = (typeof MAIL_ATTACHMENT_STORES)[number];

/** Une pièce jointe désignée par sa place au stockage. */
export interface StoredPdfRef {
  readonly store: MailAttachmentStoreName;
  readonly key: string;
}

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoreName(value: unknown): value is MailAttachmentStoreName {
  return MAIL_ATTACHMENT_STORES.some((store) => store === value);
}

/** Une référence relue d'un `jsonb` : refusée si elle est mal formée, jamais devinée. */
function refOf(value: unknown): StoredPdfRef {
  if (!isRecord(value) || typeof value["key"] !== "string" || value["key"].trim() === "") {
    throw new InvalidMailRequestError(
      `la pièce jointe (« ${STORED_PDF_FIELD} »)`,
      "est mal formée",
    );
  }
  const store = value["store"];
  if (!isStoreName(store)) {
    throw new InvalidMailRequestError(
      `le stockage « ${String(store)} » de la pièce jointe`,
      "n'est pas ouvert au service d'e-mails",
    );
  }
  return { store, key: value["key"] };
}

/**
 * Les pièces qu'une demande désigne, dans l'ordre où on les rencontre.
 *
 * Les données d'un modèle sont arbitraires : on cherche, à toute profondeur,
 * un objet qui porte `pdfStored` — la forme que `ByReference` (la porte)
 * donne à tout objet qui porterait `pdfBase64`.
 */
export function storedPdfsIn(data: unknown): readonly StoredPdfRef[] {
  if (Array.isArray(data)) {
    return data.flatMap((item: unknown) => storedPdfsIn(item));
  }
  if (!isRecord(data)) {
    return [];
  }
  const own = STORED_PDF_FIELD in data ? [refOf(data[STORED_PDF_FIELD])] : [];
  const nested = Object.entries(data)
    .filter(([field]) => field !== STORED_PDF_FIELD)
    .flatMap(([, value]) => storedPdfsIn(value));
  return [...own, ...nested];
}

/**
 * Les données telles que le gabarit les attend : chaque `pdfStored` remplacé
 * par `pdfBase64`, le contenu que `contentOf` rend pour sa référence. Le reste
 * est recopié tel quel, dans le même ordre.
 */
export function withPdfContents(data: unknown, contentOf: (ref: StoredPdfRef) => string): unknown {
  if (Array.isArray(data)) {
    return data.map((item: unknown) => withPdfContents(item, contentOf));
  }
  if (!isRecord(data)) {
    return data;
  }
  const entries = Object.entries(data).map(([field, value]): [string, unknown] =>
    field === STORED_PDF_FIELD
      ? [PDF_CONTENT_FIELD, contentOf(refOf(value))]
      : [field, withPdfContents(value, contentOf)],
  );
  return Object.fromEntries(entries);
}
