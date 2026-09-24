import { describe, expect, it } from 'vitest';

import { type PlacedBlock } from '../storefront-grid';
import {
  activeCarousel,
  autoplayLabel,
  carouselOf,
  contentsOf,
  DEFAULT_CAROUSEL,
  setCarousel,
  setContents,
  slideAt,
} from '../storefront-carousel';

const ALL = ['all'] as const;

const tile: PlacedBlock = { id: 't', format: 'tile', column: 1, row: 1, shelves: ALL };

describe('un contenu ou plusieurs', () => {
  it('par défaut : un seul contenu, et des réglages de défilement par défaut', () => {
    expect(contentsOf(tile)).toBe('single');
    expect(carouselOf(tile)).toEqual({
      nav: 'dots',
      autoplay: false,
      intervalSeconds: 5,
      firstSeconds: 8,
      sampleCount: 3,
    });
    expect(activeCarousel(tile)).toBeNull();
  });

  it('plusieurs : le défilement entre en vigueur', () => {
    const [multi] = setContents([tile], 't', 'multiple');
    expect(multi && activeCarousel(multi)).toEqual(DEFAULT_CAROUSEL);
  });

  it('repasser à un seul GARDE les réglages, inactifs, et les retrouve au retour', () => {
    const tuned = setCarousel(setContents([tile], 't', 'multiple'), 't', {
      nav: 'arrows',
      autoplay: true,
    });
    if (!tuned.ok) throw new Error('refus inattendu');
    const single = setContents(tuned.blocks, 't', 'single');
    expect(single[0] && activeCarousel(single[0])).toBeNull();
    expect(single[0]?.carousel).toMatchObject({ nav: 'arrows', autoplay: true });
    const back = setContents(single, 't', 'multiple');
    expect(back[0] && activeCarousel(back[0])).toMatchObject({ nav: 'arrows', autoplay: true });
  });

  it('bornes : 3–15 s par contenu, 3–30 s pour le premier, 2–6 contenus simulés', () => {
    expect(setCarousel([tile], 't', { intervalSeconds: 3 }).ok).toBe(true);
    expect(setCarousel([tile], 't', { intervalSeconds: 15 }).ok).toBe(true);
    expect(setCarousel([tile], 't', { intervalSeconds: 2 })).toMatchObject({
      ok: false,
      field: 'intervalSeconds',
    });
    expect(setCarousel([tile], 't', { intervalSeconds: 16 })).toMatchObject({
      ok: false,
      field: 'intervalSeconds',
    });
    expect(setCarousel([tile], 't', { intervalSeconds: 4.5 })).toMatchObject({
      ok: false,
      field: 'intervalSeconds',
    });
    expect(setCarousel([tile], 't', { firstSeconds: 30 }).ok).toBe(true);
    expect(setCarousel([tile], 't', { firstSeconds: 31 })).toMatchObject({
      ok: false,
      field: 'firstSeconds',
    });
    expect(setCarousel([tile], 't', { firstSeconds: 2 })).toMatchObject({
      ok: false,
      field: 'firstSeconds',
    });
    expect(setCarousel([tile], 't', { sampleCount: 2 }).ok).toBe(true);
    expect(setCarousel([tile], 't', { sampleCount: 6 }).ok).toBe(true);
    expect(setCarousel([tile], 't', { sampleCount: 1 })).toMatchObject({
      ok: false,
      field: 'sampleCount',
    });
    expect(setCarousel([tile], 't', { sampleCount: 7 })).toMatchObject({
      ok: false,
      field: 'sampleCount',
    });
  });

  it('un refus ne touche à rien, même aux champs valides du même envoi', () => {
    const result = setCarousel([tile], 't', { nav: 'both', firstSeconds: 99 });
    expect(result.ok).toBe(false);
  });

  it('le repère « auto » ne paraît qu’en plusieurs ET automatique', () => {
    const auto: PlacedBlock = {
      ...tile,
      contents: 'multiple',
      carousel: { ...DEFAULT_CAROUSEL, autoplay: true },
    };
    expect(autoplayLabel(auto)).toBe('auto · 8 s puis 5 s');
    expect(autoplayLabel({ ...auto, contents: 'single' })).toBeNull();
    expect(autoplayLabel({ ...auto, carousel: DEFAULT_CAROUSEL })).toBeNull();
  });
});

describe('slideAt — la séquence simulée', () => {
  const carousel = { ...DEFAULT_CAROUSEL, autoplay: true }; // 8 s, puis 5 s, 3 contenus

  it('le premier reste firstSeconds', () => {
    expect(slideAt(0, carousel)).toBe(0);
    expect(slideAt(7_999, carousel)).toBe(0);
  });

  it('les suivants restent intervalSeconds chacun', () => {
    expect(slideAt(8_000, carousel)).toBe(1);
    expect(slideAt(12_999, carousel)).toBe(1);
    expect(slideAt(13_000, carousel)).toBe(2);
    expect(slideAt(17_999, carousel)).toBe(2);
  });

  it('le cycle reprend au premier, qui retrouve sa durée longue', () => {
    expect(slideAt(18_000, carousel)).toBe(0);
    expect(slideAt(25_999, carousel)).toBe(0);
    expect(slideAt(26_000, carousel)).toBe(1);
  });

  it('suit le nombre de contenus simulés', () => {
    const two = { ...carousel, sampleCount: 2 };
    expect(slideAt(13_000, two)).toBe(0);
  });
});
