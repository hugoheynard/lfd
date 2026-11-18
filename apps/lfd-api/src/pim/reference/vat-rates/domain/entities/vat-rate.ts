import { EmptyVatRateNameError, VatRateInUseError } from "../errors/vat-rate-errors.js";
import { VatPercent } from "../value-objects/vat-percent.js";

/**
 * **Le taux de TVA — l'agrégat.**
 *
 * Référence commerciale partagée : les familles pointent dessus
 * (`emporterTvaId` / `surPlaceTvaId`), et les canaux en dérivent ce dont ils
 * ont besoin. Il en reste UN depuis le 2026-09-21, et il lit un nombre : le
 * second en dérivait une collection `tva-*`, qui est partie avec lui.
 *
 * Ce qu'il garantit : le **taux est valide** (VO `VatPercent`), le **nom n'est
 * jamais vide**, et **un taux qui sert ne s'archive pas** — le compte de ce qui
 * le porte lui est apporté par un port d'usage, la règle est ici. Ce qu'il ne
 * peut pas voir, et qui reste au handler : qu'aucun AUTRE taux ne porte déjà
 * ce taux.
 *
 * Il ne se supprime pas (décision de Hugo du 2026-11-18, même jamais utilisé) :
 * il s'archive, ne se propose plus, et se restaure.
 */
export interface VatRateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
  /** `null` = en service. */
  readonly archivedAt: Date | null;
}

/** Ce qu'une révision remplace — tout, d'un bloc. */
export interface VatRateRevision {
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export interface NewVatRateInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
}

export class VatRate {
  private constructor(
    private readonly identity: string,
    private nameValue: string,
    private descriptionValue: string,
    private rateValue: VatPercent,
    private archivedAtValue: Date | null,
  ) {}

  static open(input: NewVatRateInput): VatRate {
    return new VatRate(
      input.id,
      requireName(input.name),
      input.description.trim(),
      VatPercent.create(input.percent),
      null,
    );
  }

  /**
   * Reconstitue depuis la base. Le taux **repasse par son VO** : une ligne
   * écrite avant que la règle existe se signale ici plutôt que de ressortir
   * telle quelle vers un canal.
   */
  static reconstitute(snapshot: VatRateSnapshot): VatRate {
    return new VatRate(
      snapshot.id,
      snapshot.name,
      snapshot.description,
      VatPercent.create(snapshot.percent),
      snapshot.archivedAt,
    );
  }

  get id(): string {
    return this.identity;
  }

  get percent(): number {
    return this.rateValue.percent;
  }

  /**
   * Révise le taux d'un geste — c'est ainsi que le back-office l'édite.
   *
   * Un record plutôt que trois arguments positionnels : `name` et `description`
   * sont deux `string` voisins, et les intervertir ne se voit ni au compilateur
   * ni à la lecture — le taux s'appellerait « Appliqué aux viennoiseries » et
   * sa description « Réduit ». La même raison a fait passer `Category.setVat`
   * au record.
   */
  revise(input: VatRateRevision): void {
    this.nameValue = requireName(input.name);
    this.descriptionValue = input.description.trim();
    this.rateValue = VatPercent.create(input.percent);
  }

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  /**
   * Archive le taux : il ne se propose plus au choix d'une famille ou d'une
   * fiche. **Refusé tant qu'une famille ou une fiche le porte** — sans quoi
   * une fiche se facturerait à un taux que plus personne ne peut choisir.
   *
   * @param holders combien de familles et de fiches le portent, lu par le port
   *   d'usage (`VatRateUsageReader`).
   * @returns `false` si le taux était déjà archivé — le geste rejoué ne change rien.
   * @throws {VatRateInUseError} une famille ou une fiche le porte encore.
   */
  archive(at: Date, holders: number): boolean {
    if (this.archivedAtValue !== null) {
      return false;
    }
    if (holders > 0) {
      throw new VatRateInUseError(this.identity);
    }
    this.archivedAtValue = at;
    return true;
  }

  /** Remet le taux en service. `false` s'il l'était déjà. */
  restore(): boolean {
    if (this.archivedAtValue === null) {
      return false;
    }
    this.archivedAtValue = null;
    return true;
  }

  snapshot(): VatRateSnapshot {
    return {
      id: this.identity,
      name: this.nameValue,
      description: this.descriptionValue,
      percent: this.rateValue.percent,
      archivedAt: this.archivedAtValue,
    };
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new EmptyVatRateNameError();
  }
  return trimmed;
}
