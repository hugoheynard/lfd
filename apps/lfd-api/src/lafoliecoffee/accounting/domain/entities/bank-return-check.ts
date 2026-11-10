import {
  BankReturnCheckAlreadyAttestedError,
  BankReturnCheckNotAttestedError,
  InvalidBankReturnCheckError,
} from "../errors/bank-return-check-errors.js";
import { standingCheckOf, type BankReturnCheckLine } from "../services/bank-return-checks.js";
import type { StaffStamp } from "./collection-batch.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
/** La note d'un retrait : dire pourquoi, en une phrase. */
export const BANK_RETURN_CHECK_NOTE_MAX = 500;

/** Une ligne du registre : une attestation, ou son retrait (avec sa note). */
export interface BankReturnCheckEntry extends BankReturnCheckLine {
  readonly note: string | null;
}

export interface BankReturnCheckDayState {
  readonly legalEntityId: string;
  readonly day: string;
  readonly entries: readonly BankReturnCheckEntry[];
}

/**
 * **« Retours contrôlés » pour une entité et un jour** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, P3) : le fichier d'impayés
 * du jour a été lu à la banque, qu'il ait porté des retours ou non — un jour
 * sans impayé n'écrit rien ailleurs.
 *
 * Les invariants :
 *
 * - **aucune ligne ne s'efface** : l'agrégat n'ajoute que des lignes, et la
 *   dernière fait foi (`standingCheckOf`) ;
 * - on n'atteste pas un jour déjà attesté, on ne retire que ce qui l'est ;
 * - un retrait dit pourquoi (note obligatoire).
 *
 * ⚠️ Une attestation ne conditionne **aucun** geste du domaine : elle ne
 * gouverne que l'écran (§ « Règles des attestations »).
 */
export class BankReturnCheckDay {
  private readonly added: BankReturnCheckEntry[] = [];

  private constructor(private readonly state: BankReturnCheckDayState) {}

  /** @throws {InvalidBankReturnCheckError} un jour mal écrit. */
  static rehydrate(state: BankReturnCheckDayState): BankReturnCheckDay {
    if (!DAY.test(state.day)) {
      throw new InvalidBankReturnCheckError(`jour « ${state.day} » illisible (AAAA-MM-JJ attendu)`);
    }
    return new BankReturnCheckDay(state);
  }

  get legalEntityId(): string {
    return this.state.legalEntityId;
  }

  get day(): string {
    return this.state.day;
  }

  /** L'attestation qui fait foi, ou `null`. */
  get standing(): BankReturnCheckEntry | null {
    return standingCheckOf([...this.state.entries, ...this.added]);
  }

  /**
   * Atteste le jour. Un jour PASSÉ s'atteste encore (le fichier de ce jour se
   * relit sur le portail) ; un jour à venir, non : on ne contrôle pas ce que
   * la banque n'a pas encore rendu.
   *
   * @throws {InvalidBankReturnCheckError} le jour est après `today`.
   * @throws {BankReturnCheckAlreadyAttestedError} le jour l'est déjà.
   */
  attest(id: string, stamp: StaffStamp, today: string): BankReturnCheckEntry {
    if (this.state.day > today) {
      throw new InvalidBankReturnCheckError(
        `le ${this.state.day} n'est pas encore arrivé — on n'atteste que le jour même ou un jour passé`,
      );
    }
    if (this.standing !== null) {
      throw new BankReturnCheckAlreadyAttestedError(this.state.day);
    }
    return this.append({ id, day: this.state.day, ...stamp, withdrawn: false, note: null });
  }

  /**
   * @throws {InvalidBankReturnCheckError} note vide ou trop longue.
   * @throws {BankReturnCheckNotAttestedError} rien à retirer.
   */
  withdraw(id: string, stamp: StaffStamp, note: string): BankReturnCheckEntry {
    const said = note.trim();
    if (said === "" || said.length > BANK_RETURN_CHECK_NOTE_MAX) {
      throw new InvalidBankReturnCheckError(
        `un retrait dit pourquoi, en ${String(BANK_RETURN_CHECK_NOTE_MAX)} caractères au plus`,
      );
    }
    if (this.standing === null) {
      throw new BankReturnCheckNotAttestedError(this.state.day);
    }
    return this.append({ id, day: this.state.day, ...stamp, withdrawn: true, note: said });
  }

  /** Les lignes ajoutées depuis le chargement — les seules que `save` écrit. */
  newEntries(): readonly BankReturnCheckEntry[] {
    return [...this.added];
  }

  private append(entry: BankReturnCheckEntry): BankReturnCheckEntry {
    this.added.push(entry);
    return entry;
  }
}
