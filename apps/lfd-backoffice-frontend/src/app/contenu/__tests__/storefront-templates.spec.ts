import { describe, expect, it } from 'vitest';

import { DEFAULT_CAROUSEL } from '@lfd/storefront-layout';

import type { EditorBlock } from '../storefront-block';
import {
  blockFromTemplate,
  createTemplate,
  deleteTemplate,
  placeTemplate,
  TEMPLATE_DESCRIPTION_MAX,
  updateTemplateLabel,
  type StorefrontTemplate,
  TEMPLATE_NAME_MAX,
  validateTemplateLabel,
  validateTemplateName,
} from '../storefront-templates';

const tuned: EditorBlock = {
  id: 'b',
  format: 'tile',
  column: 3,
  row: 2,
  shelves: ['all', 'chocolate'],
  mediaFit: 'contain',
  mediaSide: 'right',
  tone: 'dark',
  applyOnMobile: false,
  contents: 'multiple',
  carousel: { ...DEFAULT_CAROUSEL, autoplay: true, sampleCount: 5 },
};

function created(name = 'Noël'): StorefrontTemplate {
  const result = createTemplate([], tuned, 'g1', { name, description: '' });
  if (!result.ok || result.templates[0] === undefined) throw new Error('création refusée');
  return result.templates[0];
}

describe('createTemplate', () => {
  it('garde la forme et tous ses réglages — ni position, ni rayons', () => {
    expect(created()).toEqual({
      id: 'g1',
      name: 'Noël',
      format: 'tile',
      mediaFit: 'contain',
      mediaSide: 'right',
      tone: 'dark',
      applyOnMobile: false,
      contents: 'multiple',
      carousel: { ...DEFAULT_CAROUSEL, autoplay: true, sampleCount: 5 },
    });
  });

  it('ne partage pas le défilement de l’objet d’origine', () => {
    expect(created().carousel).not.toBe(tuned.carousel);
  });

  it('un objet sans réglage donne un gabarit sans réglage', () => {
    const plain: EditorBlock = { id: 'p', format: 'card', column: 1, row: 1, shelves: ['all'] };
    const result = createTemplate([], plain, 'g', { name: 'Simple', description: '' });
    expect(result.ok && result.templates[0]).toEqual({ id: 'g', name: 'Simple', format: 'card' });
  });

  it('retire les espaces autour du nom', () => {
    expect(created('  Pâques  ').name).toBe('Pâques');
  });
});

describe('validateTemplateName', () => {
  const existing = [created()];

  it('refuse un nom vide ou blanc', () => {
    expect(validateTemplateName([], '   ')).toMatchObject({ ok: false });
  });

  it(`refuse au-delà de ${TEMPLATE_NAME_MAX} caractères, après trim`, () => {
    expect(validateTemplateName([], 'a'.repeat(TEMPLATE_NAME_MAX)).ok).toBe(true);
    expect(validateTemplateName([], ` ${'a'.repeat(TEMPLATE_NAME_MAX)} `).ok).toBe(true);
    expect(validateTemplateName([], 'a'.repeat(TEMPLATE_NAME_MAX + 1)).ok).toBe(false);
  });

  it('refuse un doublon, à la casse et aux accents près, en le nommant', () => {
    expect(validateTemplateName(existing, 'noel')).toEqual({
      ok: false,
      message: 'Le gabarit « Noël » existe déjà : choisissez un autre nom.',
    });
    expect(validateTemplateName(existing, ' NOËL ').ok).toBe(false);
    expect(validateTemplateName(existing, 'Noël 2').ok).toBe(true);
  });

  it('un gabarit renommé peut garder son propre nom', () => {
    expect(validateTemplateName(existing, 'Noël', 'g1').ok).toBe(true);
  });
});

describe('updateTemplateLabel / deleteTemplate', () => {
  it('renomme sans toucher aux réglages', () => {
    const result = updateTemplateLabel([created()], 'g1', { name: ' Fêtes ', description: '' });
    expect(result.ok && result.templates[0]).toMatchObject({ name: 'Fêtes', mediaSide: 'right' });
  });

  it('refuse le nom d’un autre gabarit', () => {
    const two = createTemplate([created()], tuned, 'g2', { name: 'Pâques', description: '' });
    if (!two.ok) throw new Error('refus inattendu');
    expect(
      updateTemplateLabel(two.templates, 'g2', { name: 'noël', description: '' }),
    ).toMatchObject({ ok: false });
  });

  it('supprime le seul gabarit visé', () => {
    expect(deleteTemplate([created()], 'g1')).toEqual([]);
    expect(deleteTemplate([created()], 'nope')).toHaveLength(1);
  });
});

describe('blockFromTemplate — une copie indépendante', () => {
  it('pose les réglages à la case et sur les rayons donnés', () => {
    expect(blockFromTemplate(created(), 'n', { column: 2, row: 4 }, ['bread'])).toEqual({
      id: 'n',
      format: 'tile',
      column: 2,
      row: 4,
      shelves: ['bread'],
      mediaFit: 'contain',
      mediaSide: 'right',
      tone: 'dark',
      applyOnMobile: false,
      contents: 'multiple',
      carousel: { ...DEFAULT_CAROUSEL, autoplay: true, sampleCount: 5 },
    });
  });

  it('modifier le gabarit ensuite ne touche pas l’objet posé', () => {
    const template = created();
    const block = blockFromTemplate(template, 'n', { column: 1, row: 1 }, ['all']);
    expect(block.carousel).not.toBe(template.carousel);
    const renamed = updateTemplateLabel([template], 'g1', { name: 'Autre', description: 'x' });
    expect(renamed.ok).toBe(true);
    expect(block).toMatchObject({ format: 'tile', mediaSide: 'right' });
  });
});

describe('placeTemplate', () => {
  it('pose à la première place libre du rayon', () => {
    const blocking: EditorBlock = { id: 'x', format: 'tile', column: 1, row: 1, shelves: ['all'] };
    const result = placeTemplate([blocking], () => 2, created(), 'n', 'all');
    expect(result.ok && result.blocks[1]).toMatchObject({
      id: 'n',
      column: 3,
      row: 1,
      shelves: ['all'],
    });
  });

  it('ignore les objets des autres rayons', () => {
    const elsewhere: EditorBlock = {
      id: 'x',
      format: 'tile',
      column: 1,
      row: 1,
      shelves: ['bread'],
    };
    const result = placeTemplate([elsewhere], () => 2, created(), 'n', 'all');
    expect(result.ok && result.blocks[1]).toMatchObject({ column: 1, row: 1 });
  });

  it('dit quand la page est pleine', () => {
    const full: EditorBlock = { id: 'x', format: 'band', column: 1, row: 1, shelves: ['all'] };
    expect(placeTemplate([full], () => 1, created(), 'n', 'all')).toEqual({
      ok: false,
      reason: 'full',
    });
  });
});

describe('la description', () => {
  it('vide (ou blanche) : acceptée, et absente du gabarit', () => {
    const result = createTemplate([], tuned, 'g', { name: 'A', description: '   ' });
    expect(result.ok && result.templates[0]).not.toHaveProperty('description');
  });

  it('gardée sans ses espaces autour', () => {
    const result = createTemplate([], tuned, 'g', { name: 'A', description: '  Pour Noël  ' });
    expect(result.ok && result.templates[0]?.description).toBe('Pour Noël');
  });

  it(`refusée au-delà de ${TEMPLATE_DESCRIPTION_MAX} caractères, avec message`, () => {
    expect(
      validateTemplateLabel([], { name: 'A', description: 'a'.repeat(TEMPLATE_DESCRIPTION_MAX) })
        .ok,
    ).toBe(true);
    expect(
      createTemplate([], tuned, 'g', {
        name: 'A',
        description: 'a'.repeat(TEMPLATE_DESCRIPTION_MAX + 1),
      }),
    ).toEqual({ ok: false, message: 'Une description de gabarit tient en 280 caractères.' });
  });

  it('se modifie avec le renommage, et disparaît si on la vide', () => {
    const first = createTemplate([], tuned, 'g', { name: 'A', description: 'Avant' });
    if (!first.ok) throw new Error('refus inattendu');
    const changed = updateTemplateLabel(first.templates, 'g', { name: 'A', description: 'Après' });
    expect(changed.ok && changed.templates[0]?.description).toBe('Après');
    const cleared = updateTemplateLabel(first.templates, 'g', { name: 'A', description: '' });
    expect(cleared.ok && cleared.templates[0]).not.toHaveProperty('description');
    expect(cleared.ok && cleared.templates[0]).toMatchObject({
      format: 'tile',
      mediaSide: 'right',
    });
  });
});
