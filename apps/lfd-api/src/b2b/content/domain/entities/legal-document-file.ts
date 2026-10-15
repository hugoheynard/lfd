import type { SalesTermsDocument } from "@lfd/contracts";

import { LegalDocumentFileAlreadySupersededError } from "../errors/legal-document-file-errors.js";

/** Le nom de fichier de chaque texte — ce que le client voit dans ses téléchargements. */
const DOWNLOAD_STEMS: Readonly<Record<SalesTermsDocument, string>> = {
  salesTerms: "cgv-particuliers",
  salesTermsPro: "cgv-professionnels",
};

/** Le préfixe de stockage de chaque texte, sous `legal/` du bucket `customers`. */
const STORAGE_FOLDERS: Readonly<Record<SalesTermsDocument, string>> = {
  salesTerms: "sales-terms",
  salesTermsPro: "sales-terms-pro",
};

/** Le jour de Paris d'un instant, `AAAA-MM-JJ` — c'est la date que lit un client français. */
const PARIS_DAY = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ce qu'un dépôt fige — tout est connu avant l'écriture. */
export interface LegalDocumentFileDeposit {
  readonly id: string;
  readonly document: SalesTermsDocument;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly uploadedAt: Date;
  readonly uploadedByStaffId: string;
}

/** L'état complet, tel que l'adaptateur le relit. */
export interface LegalDocumentFileState extends LegalDocumentFileDeposit {
  readonly storageKey: string;
  readonly supersededAt: Date | null;
}

/**
 * **Un PDF de référence des CGV** (plan `legal/plan-cgv-par-audience.md`, C3).
 *
 * Sa seule transition est d'être REMPLACÉ, une fois : rien d'autre ne bouge,
 * et la base le tient aussi (déclencheur sur `legal_document_files`). La clé de
 * stockage dérive de l'identifiant, jamais du nom déposé : deux dépôts ne
 * peuvent pas viser le même objet, donc aucun ne peut en écraser un autre.
 */
export class LegalDocumentFile {
  private constructor(
    private readonly state: LegalDocumentFileDeposit,
    readonly storageKey: string,
    private supersededAtValue: Date | null,
  ) {}

  /** Un dépôt neuf : en vigueur, sous une clé qui n'a jamais servi. */
  static deposit(deposit: LegalDocumentFileDeposit): LegalDocumentFile {
    const key = `legal/${STORAGE_FOLDERS[deposit.document]}/${deposit.id}.pdf`;
    return new LegalDocumentFile(deposit, key, null);
  }

  static reconstitute(state: LegalDocumentFileState): LegalDocumentFile {
    return new LegalDocumentFile(state, state.storageKey, state.supersededAt);
  }

  get id(): string {
    return this.state.id;
  }

  get document(): SalesTermsDocument {
    return this.state.document;
  }

  get supersededAt(): Date | null {
    return this.supersededAtValue;
  }

  /**
   * Remplacé par un dépôt plus récent.
   *
   * @throws {LegalDocumentFileAlreadySupersededError} il l'est déjà.
   */
  supersede(at: Date, documentTitle: string): void {
    if (this.supersededAtValue !== null) {
      throw new LegalDocumentFileAlreadySupersededError(documentTitle);
    }
    this.supersededAtValue = at;
  }

  /** `cgv-professionnels-2026-10-12.pdf` — daté du jour du dépôt, à Paris. */
  downloadFileName(): string {
    return `${DOWNLOAD_STEMS[this.state.document]}-${PARIS_DAY.format(this.state.uploadedAt)}.pdf`;
  }

  toState(): LegalDocumentFileState {
    return { ...this.state, storageKey: this.storageKey, supersededAt: this.supersededAtValue };
  }
}
