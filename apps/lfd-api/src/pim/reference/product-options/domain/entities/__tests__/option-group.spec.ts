import { OptionGroup, type OptionGroupInput } from "../option-group.js";
import {
  DuplicateOptionChoiceKeyError,
  EmptyOptionGroupNameError,
  OptionGroupWithoutChoiceError,
} from "../../errors/option-group-errors.js";

/**
 * Le groupe d'options (`plan-options-de-commande.md`, § 3.1) : un nom, des
 * choix ordonnés, et un choix retiré s'archive — sa clé ne disparaît jamais.
 * Les dates ne sont comparées qu'entre elles : aucune horloge n'est lue.
 */

const AT = new Date("2026-11-19T09:00:00.000Z");
const LATER = new Date("2026-11-20T09:00:00.000Z");

const TRANCHAGE: OptionGroupInput = {
  name: "  Tranchage ",
  choices: [
    { key: "tranche", label: "Tranché", audience: "both" },
    { key: "tranche-fin", label: "Tranché fin", audience: "pro" },
  ],
};

const open = () => OptionGroup.open("grp_1", TRANCHAGE);
const keys = (group: OptionGroup) => group.snapshot().choices.map((choice) => choice.key);
const archivedKeys = (group: OptionGroup) =>
  group
    .snapshot()
    .choices.filter((choice) => choice.archivedAt !== null)
    .map((choice) => choice.key);

describe("OptionGroup.open", () => {
  it("ouvre un groupe en service, nom nettoyé, choix rangés dans l'ordre reçu", () => {
    const snapshot = open().snapshot();
    expect(snapshot).toMatchObject({ id: "grp_1", name: "Tranchage", archivedAt: null });
    expect(snapshot.choices.map(({ key, position }) => [key, position])).toEqual([
      ["tranche", 0],
      ["tranche-fin", 1],
    ]);
  });

  it("refuse un nom vide", () => {
    expect(() => OptionGroup.open("grp_1", { ...TRANCHAGE, name: "   " })).toThrow(
      EmptyOptionGroupNameError,
    );
  });

  it("refuse un groupe sans choix : « sans » est implicite", () => {
    expect(() => OptionGroup.open("grp_1", { ...TRANCHAGE, choices: [] })).toThrow(
      OptionGroupWithoutChoiceError,
    );
  });

  it("refuse deux choix à la même clé", () => {
    const twice = [TRANCHAGE.choices[0]!, { key: "tranche", label: "Autre", audience: "pro" }];
    expect(() => OptionGroup.open("grp_1", { ...TRANCHAGE, choices: twice })).toThrow(
      DuplicateOptionChoiceKeyError,
    );
  });
});

describe("OptionGroup.revise", () => {
  it("archive un choix retiré de la liste, sans le supprimer, et le range derrière", () => {
    const group = open();
    const changed = group.revise({ name: "Tranchage", choices: [TRANCHAGE.choices[1]!] }, AT);

    expect(changed).toBe(true);
    expect(keys(group)).toEqual(["tranche-fin", "tranche"]);
    expect(group.snapshot().choices[1]).toMatchObject({ key: "tranche", archivedAt: AT });
  });

  it("restaure un choix archivé qui revient dans la liste", () => {
    const group = open();
    group.revise({ name: "Tranchage", choices: [TRANCHAGE.choices[1]!] }, AT);
    group.revise(TRANCHAGE, LATER);

    expect(archivedKeys(group)).toEqual([]);
    expect(keys(group)).toEqual(["tranche", "tranche-fin"]);
  });

  it("garde la date d'archive d'un choix déjà archivé", () => {
    const group = open();
    group.revise({ name: "Tranchage", choices: [TRANCHAGE.choices[1]!] }, AT);
    group.revise({ name: "Tranchage bis", choices: [TRANCHAGE.choices[1]!] }, LATER);

    expect(group.snapshot().choices[1]?.archivedAt).toEqual(AT);
  });

  it("ajoute une clé neuve à son rang, change un libellé et une clientèle", () => {
    const group = open();
    group.revise(
      {
        name: "Tranchage",
        choices: [
          { key: "entier-emballe", label: "Emballé", audience: "public" },
          { key: "tranche", label: "Tranché épais", audience: "pro" },
        ],
      },
      AT,
    );
    expect(group.snapshot().choices.slice(0, 2)).toMatchObject([
      { key: "entier-emballe", position: 0, archivedAt: null },
      { key: "tranche", label: "Tranché épais", audience: "pro", position: 1 },
    ]);
    expect(archivedKeys(group)).toEqual(["tranche-fin"]);
  });

  it("dit qu'une révision à l'identique ne change rien", () => {
    expect(open().revise(TRANCHAGE, AT)).toBe(false);
  });

  it("refuse de retirer TOUS les choix : on archive le groupe", () => {
    expect(() => open().revise({ name: "Tranchage", choices: [] }, AT)).toThrow(
      OptionGroupWithoutChoiceError,
    );
  });
});

describe("OptionGroup — archive et restauration", () => {
  it("archive, puis dit qu'un second archivage ne change rien", () => {
    const group = open();
    expect(group.archive(AT)).toBe(true);
    expect(group.isArchived).toBe(true);
    expect(group.archive(LATER)).toBe(false);
    expect(group.snapshot().archivedAt).toEqual(AT);
  });

  it("restaure un groupe archivé, et pas un groupe en service", () => {
    const group = open();
    expect(group.restore()).toBe(false);
    group.archive(AT);
    expect(group.restore()).toBe(true);
    expect(group.isArchived).toBe(false);
  });

  it("se reconstitue dans l'ordre des rangs, quel que soit l'ordre des lignes", () => {
    const snapshot = open().snapshot();
    const group = OptionGroup.reconstitute({
      ...snapshot,
      choices: [...snapshot.choices].reverse(),
    });
    expect(keys(group)).toEqual(["tranche", "tranche-fin"]);
  });
});
