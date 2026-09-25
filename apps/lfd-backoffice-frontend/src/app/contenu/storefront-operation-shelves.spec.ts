import type { StorefrontContent } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { announcedShelvesOf } from './storefront-operation-shelves';

const info = (patch: Partial<Extract<StorefrontContent, { kind: 'info' }>>): StorefrontContent => ({
  kind: 'info',
  badge: null,
  title: { fr: 'Noël' },
  lede: null,
  image: null,
  linkShelfKey: null,
  operationKey: null,
  ...patch,
});

describe('announcedShelvesOf', () => {
  it('rend le rayon de l’opération liée', () => {
    expect(announcedShelvesOf([info({ operationKey: 'noel-2026' })])).toEqual(['op:noel-2026']);
  });

  it('rend le rayon d’opération qu’une annonce ouvre', () => {
    expect(announcedShelvesOf([info({ linkShelfKey: 'op:noel-2026' })])).toEqual(['op:noel-2026']);
  });

  it('ignore les articles, les familles et les annonces sans lien', () => {
    expect(
      announcedShelvesOf([
        { kind: 'product', sku: 'CRO' },
        info({ linkShelfKey: 'bread' }),
        info({}),
      ]),
    ).toEqual([]);
  });

  it('ne compte qu’une fois une opération annoncée deux fois', () => {
    expect(
      announcedShelvesOf([
        info({ operationKey: 'noel-2026' }),
        info({ linkShelfKey: 'op:noel-2026' }),
      ]),
    ).toEqual(['op:noel-2026']);
  });
});
