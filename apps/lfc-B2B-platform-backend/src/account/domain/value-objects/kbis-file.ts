import { InvalidKbisFileError } from "../errors/account-errors.js";

/** Taille maximale d'un KBIS. Un extrait fait quelques pages — 10 Mo est large. */
export const KBIS_MAX_BYTES = 10 * 1024 * 1024;

/** Le seul type accepté ; ce que l'entreprise dépose est un PDF. */
export const KBIS_CONTENT_TYPE = "application/pdf";

/** En-tête magique d'un fichier PDF : `%PDF-`. */
const PDF_MAGIC = Buffer.from("%PDF-", "latin1");

/**
 * Le fichier KBIS déposé, validé.
 *
 * `create()` est le seul constructeur : un fichier non conforme n'existe pas en
 * mémoire. La vérité du format vient des **octets** (l'en-tête `%PDF-`), pas du
 * `Content-Type` annoncé par le client — celui-ci se falsifie, un PDF renommé en
 * `.pdf` ou un exécutable étiqueté `application/pdf` seraient sinon acceptés. Le
 * `contentType` exposé est donc toujours `application/pdf`, dérivé du fichier, et
 * c'est lui qu'on servira au téléchargement.
 */
export class KbisFile {
  private constructor(
    readonly fileName: string,
    readonly bytes: Buffer,
  ) {}

  static create(fileName: string, bytes: Buffer): KbisFile {
    const name = fileName.trim();
    if (name === "") {
      throw new InvalidKbisFileError("nom de fichier manquant.");
    }
    if (bytes.length === 0) {
      throw new InvalidKbisFileError("fichier vide.");
    }
    if (bytes.length > KBIS_MAX_BYTES) {
      throw new InvalidKbisFileError(`taille maximale ${KBIS_MAX_BYTES / (1024 * 1024)} Mo.`);
    }
    if (!bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new InvalidKbisFileError("un PDF est attendu.");
    }
    return new KbisFile(name, bytes);
  }

  /** Toujours `application/pdf` — dérivé du contenu, jamais du client. */
  get contentType(): string {
    return KBIS_CONTENT_TYPE;
  }

  get size(): number {
    return this.bytes.length;
  }
}
