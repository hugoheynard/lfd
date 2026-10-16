import { DomainError } from "../../../../platform/shared/errors/app-error.js";
import { Operation, type ReferentialOperation } from "../entities/operation.js";
import type { OperationRecord } from "../entities/operation-shapes.js";
import type { OperationFocal } from "../value-objects/operation-image.js";
import {
  fieldTexts,
  MIGRATION_FIELDS,
  type FieldTexts,
  type MigrationField,
} from "./operation-migration-fields.js";
import { restrictedValues, restricts, type MigrationRestriction } from "./operation-restriction.js";

export type { MigrationRestriction } from "./operation-restriction.js";

/** Une ligne du miroir : la copie telle que la base la rend, et sa surcharge. */
export interface MirroredOperation {
  readonly record: OperationRecord;
  readonly restriction: MigrationRestriction | null;
}

/** Ce que la migration lit, une fois, avant de rien décider. */
export interface MigrationSources {
  /** Le référentiel — `hidden` y est toujours `false` : il ne masquait pas. */
  readonly referential: readonly ReferentialOperation[];
  readonly mirror: readonly MirroredOperation[];
  /** Les SKU du référentiel que le commerce ne connaît pas. */
  readonly unknownSkus: ReadonlySet<string>;
  /** Le point focal de chaque image, lu à la médiathèque ; absente = inconnue. */
  readonly focals: ReadonlyMap<string, OperationFocal | null>;
  readonly now: Date;
}

export type MigrationOutcome =
  "create" | "adopt" | "already_at_commerce" | "archived_unchanged" | "mirror_only" | "blocked";

export type MigrationExplanation =
  "same" | "referential_newer" | "not_in_mirror" | "held_at_commerce" | "unexplained";

export interface MigrationFieldLine {
  readonly field: MigrationField;
  readonly referential: string | null;
  readonly mirror: string | null;
  readonly result: string;
  readonly restricted: boolean;
  readonly explanation: MigrationExplanation;
}

/** Une opération dans le plan : ce qu'on en fera, et ce qu'on écrira. */
export interface MigrationLine {
  readonly key: string;
  readonly name: string;
  readonly outcome: MigrationOutcome;
  readonly fields: readonly MigrationFieldLine[];
  readonly droppedSkus: readonly string[];
  /** La surcharge, si elle restreignait quelque chose — tracée au journal à l'écriture. */
  readonly restriction: MigrationRestriction | null;
  readonly problems: readonly string[];
  /** Les valeurs à écrire — `null` si la ligne n'écrit rien. */
  readonly values: ReferentialOperation | null;
}

/**
 * **Le plan de la migration des opérations au commerce** (lot 3 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * « La migration repart du PIM ») — pur, sans base ni horloge.
 *
 * La source est le RÉFÉRENTIEL, pas le miroir : une opération éditée au
 * référentiel sans push a un miroir périmé. Ses valeurs sont restreintes par
 * la surcharge existante — le calcul d'`effectiveOperation` : `LEAST` des
 * clôtures, sélection moins `hiddenSkus`, intersection des clientèles ; une
 * intersection vide donne une opération MASQUÉE, clientèle laissée à celle du
 * référentiel (« Ce que devient chaque champ de la surcharge »). Les SKU que
 * le commerce ne connaît pas sont écartés, comme le push les écartait.
 *
 * Chaque champ est comparé à ce que la boutique appliquait (le miroir,
 * surcharge combinée). Un écart que rien n'explique — ni un référentiel plus
 * récent que l'envoi, ni une opération jamais envoyée — BLOQUE, comme une
 * valeur que l'agrégat refuse (une fenêtre de commande vidée par la surcharge).
 *
 * Rejouable : une opération déjà écrite au commerce n'est plus reprise.
 */
export function planOperationMigration(sources: MigrationSources): MigrationLine[] {
  const mirror = new Map(sources.mirror.map((row) => [row.record.key, row]));
  const referentialKeys = new Set(sources.referential.map((operation) => operation.key));
  const lines = sources.referential.map((referential) =>
    lineOf(referential, mirror.get(referential.key) ?? null, sources),
  );
  const mirrorOnly = sources.mirror
    .filter((row) => !referentialKeys.has(row.record.key))
    .map(mirrorOnlyLine);
  return [...lines, ...mirrorOnly];
}

function lineOf(
  referential: ReferentialOperation,
  mirrored: MirroredOperation | null,
  sources: MigrationSources,
): MigrationLine {
  const restriction = mirrored?.restriction ?? null;
  const droppedSkus = referential.skus.filter((sku) => sources.unknownSkus.has(sku));
  const restricted = restrictedValues(referential, restriction);
  const result: ReferentialOperation = {
    ...restricted,
    image:
      restricted.image === null
        ? null
        : { url: restricted.image.url, focal: sources.focals.get(restricted.image.url) ?? null },
    skus: restricted.skus.filter((sku) => !sources.unknownSkus.has(sku)),
  };
  const base = {
    key: referential.key,
    name: referential.name.fr,
    droppedSkus,
    restriction: restricts(restriction) ? restriction : null,
  };
  if (mirrored !== null && mirrored.record.lastWrite !== null) {
    return held(base, referential, mirrored, "already_at_commerce");
  }
  if (mirrored !== null && mirrored.record.archivedAt !== null) {
    return held(base, referential, mirrored, "archived_unchanged");
  }
  const fields = compare(referential, mirrored, result, restriction);
  const problems = [...unexplained(fields), ...refusalsOf(result, sources.now)];
  return {
    ...base,
    outcome: problems.length > 0 ? "blocked" : mirrored === null ? "create" : "adopt",
    fields,
    problems,
    values: problems.length > 0 ? null : result,
  };
}

/** Une ligne que la migration ne touche pas : ce qui reste est ce que le commerce tient. */
function held(
  base: Pick<MigrationLine, "key" | "name" | "droppedSkus" | "restriction">,
  referential: ReferentialOperation,
  mirrored: MirroredOperation,
  outcome: "already_at_commerce" | "archived_unchanged",
): MigrationLine {
  const kept = asApplied(mirrored);
  const before = fieldTexts(referential);
  const after = fieldTexts(kept);
  return {
    ...base,
    outcome,
    fields: MIGRATION_FIELDS.map((field) => ({
      field,
      referential: before[field],
      mirror: after[field],
      result: after[field],
      restricted: false,
      explanation: outcome === "already_at_commerce" ? "held_at_commerce" : "same",
    })),
    problems: [],
    values: null,
  };
}

function mirrorOnlyLine(mirrored: MirroredOperation): MigrationLine {
  const kept = fieldTexts(asApplied(mirrored));
  return {
    key: mirrored.record.key,
    name: mirrored.record.name.fr,
    outcome: "mirror_only",
    fields: MIGRATION_FIELDS.map((field) => ({
      field,
      referential: null,
      mirror: kept[field],
      result: kept[field],
      restricted: false,
      explanation: "same",
    })),
    droppedSkus: [],
    restriction: restricts(mirrored.restriction) ? mirrored.restriction : null,
    problems: [],
    values: null,
  };
}

/**
 * Ce que la boutique appliquait : la ligne écrite au commerce telle quelle,
 * une copie reçue restreinte par sa surcharge (`operationAsHeld`).
 */
function asApplied(mirrored: MirroredOperation): ReferentialOperation {
  const values = valuesOf(mirrored.record);
  return mirrored.record.lastWrite !== null
    ? values
    : restrictedValues(values, mirrored.restriction);
}

function compare(
  referential: ReferentialOperation,
  mirrored: MirroredOperation | null,
  result: ReferentialOperation,
  restriction: MigrationRestriction | null,
): MigrationFieldLine[] {
  const source = fieldTexts(referential);
  const unrestricted = fieldTexts({ ...referential, skus: result.skus, image: result.image });
  const restrictedTexts = fieldTexts(result);
  const received = mirrored === null ? null : fieldTexts(valuesOf(mirrored.record));
  const applied = mirrored === null ? null : fieldTexts(asApplied(mirrored));
  return MIGRATION_FIELDS.map((field) => ({
    field,
    referential: source[field],
    mirror: applied?.[field] ?? null,
    result: restrictedTexts[field],
    restricted: restriction !== null && unrestricted[field] !== restrictedTexts[field],
    explanation: explain(field, source, received, applied, restrictedTexts),
  }));
}

/** Une ligne de la base sans sa signature : ses seules valeurs. */
function valuesOf(record: OperationRecord): ReferentialOperation {
  return {
    key: record.key,
    name: record.name,
    lede: record.lede,
    image: record.image,
    schedule: record.schedule,
    audience: record.audience,
    skus: record.skus,
    hidden: record.hidden,
    archivedAt: record.archivedAt,
  };
}

function explain(
  field: MigrationField,
  referential: FieldTexts,
  received: FieldTexts | null,
  applied: FieldTexts | null,
  result: FieldTexts,
): MigrationExplanation {
  if (applied === null || received === null) {
    return "not_in_mirror";
  }
  if (applied[field] === result[field]) {
    return "same";
  }
  // Le point focal n'entre pas dans le texte de l'image : seule l'adresse compte.
  return referential[field] !== received[field] ? "referential_newer" : "unexplained";
}

function unexplained(fields: readonly MigrationFieldLine[]): string[] {
  return fields
    .filter((line) => line.explanation === "unexplained")
    .map(
      (line) =>
        `« ${line.field} » : la boutique appliquait « ${line.mirror ?? ""} », la migration ` +
        `écrirait « ${line.result} », et le référentiel n'a pas changé depuis l'envoi.`,
    );
}

/** L'agrégat juge les valeurs comme il les jugera à l'écriture — un refus bloque. */
function refusalsOf(values: ReferentialOperation, now: Date): string[] {
  try {
    Operation.fromReferential(values, { by: null, at: now });
    return [];
  } catch (error) {
    if (error instanceof DomainError) {
      return [error.message];
    }
    throw error;
  }
}
