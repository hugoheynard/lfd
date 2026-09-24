import type { PublicStorefrontPageView } from '@lfd/contracts';

import { withServedAnnouncements } from './served-announcements';
import { NOEL, productContent, storefrontObject } from './storefront.fixture';

const LINKED = { ...NOEL, linkShelfKey: null, operationKey: 'noel-2026' };

describe('withServedAnnouncements', () => {
  it('écarte une annonce dont le catalogue ne sert pas l’opération, garde le reste', () => {
    const page: PublicStorefrontPageView = {
      rows: 2,
      objects: [storefrontObject({ id: 'a', contents: [LINKED, productContent('VIE-001')] })],
    };
    const shown = withServedAnnouncements(page, () => false);
    expect(shown.objects[0]?.contents).toEqual([productContent('VIE-001')]);
  });

  it('un objet qui n’avait qu’elle reste sans contenu — la composition rend ses cases', () => {
    const page: PublicStorefrontPageView = {
      rows: 2,
      objects: [storefrontObject({ id: 'a', contents: [LINKED] })],
    };
    expect(withServedAnnouncements(page, () => false).objects[0]?.contents).toEqual([]);
  });

  it('rend la même page quand l’opération est servie, ou sans annonce liée', () => {
    const page: PublicStorefrontPageView = {
      rows: 2,
      objects: [storefrontObject({ id: 'a', contents: [LINKED, NOEL] })],
    };
    expect(withServedAnnouncements(page, (key) => key === 'noel-2026')).toBe(page);
  });
});
