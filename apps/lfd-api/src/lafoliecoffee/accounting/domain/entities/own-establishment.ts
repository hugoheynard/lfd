import {
  OwnEstablishmentAlreadyDeclaredError,
  OwnEstablishmentNotDeclaredError,
} from "../errors/collection-test-errors.js";
import type { StaffStamp } from "./collection-batch.js";

export interface OwnEstablishmentState {
  readonly companyId: string;
  /** La DERNIÈRE déclaration — une société retirée puis redéclarée en porte une neuve. */
  readonly declared: StaffStamp;
  /** `null` tant qu'elle est déclarée. */
  readonly withdrawn: StaffStamp | null;
}

/**
 * **Un de nos établissements** — une société cliente que la comptabilité a
 * déclarée « à nous » (plan `plan-prelevement-d-essai.md`, Q1, Hugo
 * 2026-10-22). C'est la seule porte du prélèvement d'essai : un essai ne vise
 * qu'une société déclarée ici.
 *
 * Faux par défaut, et faux veut dire « pas de ligne » : une société qu'on n'a
 * jamais déclarée n'a rien à porter. Retirer n'efface pas la ligne — elle garde
 * qui l'avait posée et qui l'a retirée.
 *
 * Le nom de la société n'est pas porté : il sert aux refus, et l'appelant le
 * donne.
 */
export class OwnEstablishment {
  private constructor(private state: OwnEstablishmentState) {}

  static declare(companyId: string, stamp: StaffStamp): OwnEstablishment {
    return new OwnEstablishment({ companyId, declared: stamp, withdrawn: null });
  }

  static rehydrate(state: OwnEstablishmentState): OwnEstablishment {
    return new OwnEstablishment(state);
  }

  get companyId(): string {
    return this.state.companyId;
  }

  get isDeclared(): boolean {
    return this.state.withdrawn === null;
  }

  /** Redéclare une société retirée. @throws {OwnEstablishmentAlreadyDeclaredError} */
  redeclare(stamp: StaffStamp, companyName: string): void {
    if (this.isDeclared) {
      throw new OwnEstablishmentAlreadyDeclaredError(companyName);
    }
    this.state = { ...this.state, declared: stamp, withdrawn: null };
  }

  /** @throws {OwnEstablishmentNotDeclaredError} */
  withdraw(stamp: StaffStamp, companyName: string): void {
    if (!this.isDeclared) {
      throw new OwnEstablishmentNotDeclaredError(companyName);
    }
    this.state = { ...this.state, withdrawn: stamp };
  }

  toPersistence(): OwnEstablishmentState {
    return this.state;
  }
}
