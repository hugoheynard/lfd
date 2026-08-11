import { InvalidScannedDocumentError } from "../errors/storage-errors.js";

/** Taille maximale d'une pièce. Un extrait ou un mandat fait quelques pages — 10 Mo est large. */
export const SCANNED_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Un format accepté, reconnu à ses **octets de tête**.
 *
 * La photo est là comme secours : le commercial est chez son client, la pièce
 * est sur le comptoir et le scanner est au bureau. Refuser l'image ferait
 * repartir sans la pièce — et une pièce qu'on remet à plus tard est une pièce
 * qu'on ne revoit pas.
 */
interface AcceptedFormat {
  readonly contentType: string;
  /** Vrai si ces octets commencent bien ainsi. */
  readonly matches: (bytes: Buffer) => boolean;
}

/** Les octets de tête d'un PDF : `%PDF-`. */
const PDF_MAGIC = Buffer.from("%PDF-", "latin1");

const ACCEPTED_FORMATS: readonly AcceptedFormat[] = [
  {
    contentType: "application/pdf",
    matches: (bytes) => startsWith(bytes, PDF_MAGIC),
  },
  {
    contentType: "image/jpeg",
    matches: (bytes) => startsWith(bytes, Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    contentType: "image/png",
    matches: (bytes) =>
      startsWith(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    // HEIC : ce que rend un iPhone quand il n'a pas converti. La marque tient
    // dans la boîte `ftyp`, à l'octet 4 — pas au tout début, contrairement aux
    // autres formats.
    contentType: "image/heic",
    matches: (bytes) => bytes.subarray(4, 8).toString("latin1") === "ftyp",
  },
];

/**
 * Une **pièce numérisée** déposée par un humain — extrait KBIS, mandat signé —,
 * validée.
 *
 * `create()` est le seul constructeur : un fichier non conforme n'existe pas en
 * mémoire. La vérité du format vient des **octets**, jamais du `Content-Type`
 * annoncé par le client — celui-ci se falsifie, et un exécutable étiqueté
 * `application/pdf` serait sinon accepté. Le `contentType` exposé est donc
 * toujours déduit du contenu, et c'est lui qu'on servira au téléchargement.
 */
export class ScannedDocument {
  private constructor(
    readonly fileName: string,
    readonly bytes: Buffer,
    readonly contentType: string,
  ) {}

  static create(fileName: string, bytes: Buffer): ScannedDocument {
    const name = fileName.trim();
    if (name === "") {
      throw new InvalidScannedDocumentError("nom de fichier manquant.");
    }
    if (bytes.length === 0) {
      throw new InvalidScannedDocumentError("fichier vide.");
    }
    if (bytes.length > SCANNED_DOCUMENT_MAX_BYTES) {
      throw new InvalidScannedDocumentError(
        `taille maximale ${SCANNED_DOCUMENT_MAX_BYTES / (1024 * 1024)} Mo.`,
      );
    }
    const format = ACCEPTED_FORMATS.find((candidate) => candidate.matches(bytes));
    if (format === undefined) {
      throw new InvalidScannedDocumentError("un PDF ou une photo (JPEG, PNG, HEIC) est attendu.");
    }
    return new ScannedDocument(name, bytes, format.contentType);
  }

  get size(): number {
    return this.bytes.length;
  }
}

/** Ces octets commencent-ils par cette signature ? */
function startsWith(bytes: Buffer, magic: Buffer): boolean {
  return bytes.subarray(0, magic.length).equals(magic);
}
