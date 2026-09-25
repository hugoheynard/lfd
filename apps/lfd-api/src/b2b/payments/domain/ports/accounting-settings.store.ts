/**
 * **Les réglages de la comptabilité** — une ligne, sans transition ni
 * invariant au-delà de la forme : un CRUD honnête (`CLAUDE.md` §3.1), pas un
 * agrégat.
 */
export interface AccountingSettings {
  /** Le plafond d'un lien libre, en centimes. `null` = aucun plafond. */
  readonly paymentLinkMaxCents: number | null;
}

/** Ce qu'on écrit : le réglage, et qui l'a posé quand. */
export interface AccountingSettingsWrite extends AccountingSettings {
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
}

/** Lecture seule — ce que la création d'un lien consomme (ISP). */
export abstract class AccountingSettingsReader {
  /** Ligne absente = aucun réglage posé = aucun plafond. */
  abstract read(): Promise<AccountingSettings>;
}

/** Écriture seule — le geste du comptable. */
export abstract class AccountingSettingsWriter {
  abstract write(settings: AccountingSettingsWrite): Promise<void>;
}
