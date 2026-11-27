import {
  DuplicateOptionChoiceKeyError,
  EmptyOptionGroupNameError,
  OptionGroupWithoutChoiceError,
} from "../errors/option-group-errors.js";
import {
  optionChoice,
  type OptionChoiceInput,
  type OptionChoiceSnapshot,
} from "../value-objects/option-choice.js";

/**
 * **Le groupe d'options — l'agrégat** (« Tranchage », et ses choix).
 *
 * Ce qu'il garantit : un nom jamais vide, au moins un choix en service, des
 * clés uniques dans le groupe et une clé qui ne disparaît jamais — un choix
 * retiré s'archive, il ne se supprime pas, et les commandes passées gardent
 * leur instantané (`plan-options-de-commande.md`, § 3.1). Aucun prix.
 *
 * Il ne sait pas quelles fiches l'activent : c'est la fiche qui écrit son
 * activation, et le compte lui est apporté par un port.
 */
export interface OptionGroupSnapshot {
  readonly id: string;
  readonly name: string;
  /** Tous les choix, archivés compris, dans l'ordre de leur rang. */
  readonly choices: readonly OptionChoiceSnapshot[];
  /** `null` = en service. */
  readonly archivedAt: Date | null;
}

/** Ce qu'une création ou une révision pose, d'un bloc. */
export interface OptionGroupInput {
  readonly name: string;
  /** Les choix EN SERVICE, dans l'ordre. */
  readonly choices: readonly OptionChoiceInput[];
}

export class OptionGroup {
  private constructor(
    private readonly identity: string,
    private nameValue: string,
    private choicesValue: readonly OptionChoiceSnapshot[],
    private archivedAtValue: Date | null,
  ) {}

  /** Ouvre un groupe en service, avec ses choix dans l'ordre reçu. */
  static open(id: string, input: OptionGroupInput): OptionGroup {
    return new OptionGroup(id, requireName(input.name), inService(input.choices, []), null);
  }

  /** Reconstitue depuis la base ; chaque choix repasse par sa validation. */
  static reconstitute(snapshot: OptionGroupSnapshot): OptionGroup {
    const choices = [...snapshot.choices]
      .sort((a, b) => a.position - b.position)
      .map((choice) => optionChoice(choice, choice.position, choice.archivedAt));
    return new OptionGroup(snapshot.id, snapshot.name, choices, snapshot.archivedAt);
  }

  get id(): string {
    return this.identity;
  }

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  /**
   * Révise le groupe d'un geste. `input.choices` est la liste des choix en
   * service : un choix connu absent s'archive à `at`, un choix archivé qui y
   * revient est restauré, une clé neuve s'ajoute. Les archivés gardent leur
   * libellé et passent derrière.
   *
   * @returns `false` si rien n'a changé.
   */
  revise(input: OptionGroupInput, at: Date): boolean {
    const before = JSON.stringify(this.snapshot());
    this.nameValue = requireName(input.name);
    this.choicesValue = inService(input.choices, this.choicesValue, at);
    return JSON.stringify(this.snapshot()) !== before;
  }

  /** Archive le groupe. `false` s'il l'était déjà. */
  archive(at: Date): boolean {
    if (this.archivedAtValue !== null) {
      return false;
    }
    this.archivedAtValue = at;
    return true;
  }

  /** Remet le groupe en service. `false` s'il l'était déjà. */
  restore(): boolean {
    if (this.archivedAtValue === null) {
      return false;
    }
    this.archivedAtValue = null;
    return true;
  }

  snapshot(): OptionGroupSnapshot {
    return {
      id: this.identity,
      name: this.nameValue,
      choices: this.choicesValue,
      archivedAt: this.archivedAtValue,
    };
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new EmptyOptionGroupNameError();
  }
  return trimmed;
}

/**
 * Les choix en service d'abord, dans l'ordre reçu ; puis les choix connus
 * absents de la liste, archivés (à `at` s'ils ne l'étaient pas déjà).
 *
 * @throws {OptionGroupWithoutChoiceError} aucun choix en service.
 * @throws {DuplicateOptionChoiceKeyError} deux choix reçus portent la même clé.
 */
function inService(
  listed: readonly OptionChoiceInput[],
  known: readonly OptionChoiceSnapshot[],
  at: Date | null = null,
): readonly OptionChoiceSnapshot[] {
  if (listed.length === 0) {
    throw new OptionGroupWithoutChoiceError();
  }
  const served = listed.map((choice, position) => optionChoice(choice, position, null));
  const keys = new Set<string>();
  for (const choice of served) {
    if (keys.has(choice.key)) {
      throw new DuplicateOptionChoiceKeyError(choice.key);
    }
    keys.add(choice.key);
  }
  const retired = known
    .filter((choice) => !keys.has(choice.key))
    .map((choice, rank) => ({
      ...choice,
      position: served.length + rank,
      archivedAt: choice.archivedAt ?? at,
    }));
  return [...served, ...retired];
}
