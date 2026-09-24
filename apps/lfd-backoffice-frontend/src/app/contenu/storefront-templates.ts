import {
  type CarouselSettings,
  type Cell,
  type ContentsMode,
  firstFreeCell,
  type MediaFit,
  type MediaSide,
  type ShelfKey,
  type StorefrontShape,
  type StorefrontTone,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  templateNameKey,
} from '@lfd/storefront-layout';

import type { EditorBlock } from './storefront-block';
import { type AcrossResult, placeAcross, type RowsOf } from './storefront-placement';

export { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX };

/**
 * Les gabarits de la vitrine — un objet réglé, enregistré sous un nom.
 *
 * Ils font partie de la vitrine : chargés avec elle, renvoyés dans le même
 * `PUT` (`plan-vitrine-enregistrement.md`, D3 et D6). Un gabarit NEUF porte un
 * identifiant local jusqu'à l'enregistrement ; le serveur lui en donne un.
 *
 * Un gabarit porte un nom (unique), une description facultative, la forme, le ton et ses réglages — cadrage, côté, mobile, un ou
 * plusieurs contenus, défilement (nombre simulé compris). **Ni position, ni
 * rayons, ni contenus** (`boutique-rayon-layout.md`, « Les gabarits »).
 */
export interface StorefrontTemplate {
  readonly id: string;
  readonly name: string;
  /** Facultative ; absente plutôt que vide. */
  readonly description?: string;
  readonly format: StorefrontShape;
  readonly mediaFit?: MediaFit;
  readonly mediaSide?: MediaSide;
  readonly tone?: StorefrontTone;
  readonly applyOnMobile?: boolean;
  readonly contents?: ContentsMode;
  readonly carousel?: CarouselSettings;
}

/** Ce que le formulaire d'un gabarit envoie. */
export interface TemplateLabel {
  readonly name: string;
  readonly description: string;
}

export type TemplateResult =
  | { readonly ok: true; readonly templates: readonly StorefrontTemplate[] }
  | { readonly ok: false; readonly message: string };

/**
 * Même nom à la casse et aux accents près : « Noël » et « noel » se
 * confondraient à l'œil. La clé est celle du paquet, que le serveur range dans
 * sa colonne UNIQUE — l'éditeur refuse donc exactement ce que la base refuserait.
 */
function sameName(a: string, b: string): boolean {
  return templateNameKey(a) === templateNameKey(b);
}

/**
 * Le nom retenu (sans espaces autour), ou le refus qui le dit. `exceptId` :
 * le gabarit qu'on renomme, qui peut garder son propre nom.
 */
export function validateTemplateName(
  templates: readonly StorefrontTemplate[],
  name: string,
  exceptId: string | null = null,
): { readonly ok: true; readonly name: string } | { readonly ok: false; readonly message: string } {
  const trimmed = name.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Un gabarit porte un nom.' };
  }
  if (trimmed.length > TEMPLATE_NAME_MAX) {
    return { ok: false, message: `Un nom de gabarit tient en ${TEMPLATE_NAME_MAX} caractères.` };
  }
  const clash = templates.find(
    (template) => template.id !== exceptId && sameName(template.name, trimmed),
  );
  return clash === undefined
    ? { ok: true, name: trimmed }
    : { ok: false, message: `Le gabarit « ${clash.name} » existe déjà : choisissez un autre nom.` };
}

/** Nom et description retenus, ou le premier refus qui le dit. */
export function validateTemplateLabel(
  templates: readonly StorefrontTemplate[],
  label: TemplateLabel,
  exceptId: string | null = null,
):
  | { readonly ok: true; readonly name: string; readonly description: string }
  | { readonly ok: false; readonly message: string } {
  const name = validateTemplateName(templates, label.name, exceptId);
  if (!name.ok) {
    return name;
  }
  const description = label.description.trim();
  if (description.length > TEMPLATE_DESCRIPTION_MAX) {
    return {
      ok: false,
      message: `Une description de gabarit tient en ${TEMPLATE_DESCRIPTION_MAX} caractères.`,
    };
  }
  return { ok: true, name: name.name, description };
}

function labelled(
  name: string,
  description: string,
): Pick<StorefrontTemplate, 'name' | 'description'> {
  return description === '' ? { name } : { name, description };
}

/** Ce qu'un gabarit garde d'un objet — des copies, jamais des références partagées. */
function settingsOf(
  source: Omit<StorefrontTemplate, 'id' | 'name'>,
): Omit<StorefrontTemplate, 'id' | 'name'> {
  return {
    format: source.format,
    ...(source.mediaFit === undefined ? {} : { mediaFit: source.mediaFit }),
    ...(source.mediaSide === undefined ? {} : { mediaSide: source.mediaSide }),
    ...(source.tone === undefined ? {} : { tone: source.tone }),
    ...(source.applyOnMobile === undefined ? {} : { applyOnMobile: source.applyOnMobile }),
    ...(source.contents === undefined ? {} : { contents: source.contents }),
    ...(source.carousel === undefined ? {} : { carousel: { ...source.carousel } }),
  };
}

export function createTemplate(
  templates: readonly StorefrontTemplate[],
  block: EditorBlock,
  id: string,
  label: TemplateLabel,
): TemplateResult {
  const verdict = validateTemplateLabel(templates, label);
  if (!verdict.ok) {
    return verdict;
  }
  return {
    ok: true,
    templates: [
      ...templates,
      { id, ...labelled(verdict.name, verdict.description), ...settingsOf(block) },
    ],
  };
}

/** Renomme et/ou redécrit ; une description vidée disparaît. */
export function updateTemplateLabel(
  templates: readonly StorefrontTemplate[],
  id: string,
  label: TemplateLabel,
): TemplateResult {
  const verdict = validateTemplateLabel(templates, label, id);
  if (!verdict.ok) {
    return verdict;
  }
  return {
    ok: true,
    templates: templates.map((template) => {
      if (template.id !== id) {
        return template;
      }
      return { id, ...labelled(verdict.name, verdict.description), ...settingsOf(template) };
    }),
  };
}

export function deleteTemplate(
  templates: readonly StorefrontTemplate[],
  id: string,
): readonly StorefrontTemplate[] {
  return templates.filter((template) => template.id !== id);
}

/**
 * L'objet posé depuis un gabarit : une COPIE, que modifier le gabarit ne touche
 * plus. Sans contenu : un gabarit n'en garde pas.
 */
export function blockFromTemplate(
  template: StorefrontTemplate,
  id: string,
  cell: Cell,
  shelves: readonly ShelfKey[],
): EditorBlock {
  return { id, ...settingsOf(template), column: cell.column, row: cell.row, shelves: [...shelves] };
}

/** Pose un gabarit à la première place libre du rayon édité, comme une forme. */
export function placeTemplate(
  blocks: readonly EditorBlock[],
  rowsOf: RowsOf,
  template: StorefrontTemplate,
  id: string,
  shelf: ShelfKey,
): AcrossResult<EditorBlock> | { readonly ok: false; readonly reason: 'full' } {
  const cell = firstFreeCell(blocks, rowsOf(shelf), template.format, [shelf]);
  if (cell === null) {
    return { ok: false, reason: 'full' };
  }
  return placeAcross(blocks, rowsOf, blockFromTemplate(template, id, cell, [shelf]));
}
