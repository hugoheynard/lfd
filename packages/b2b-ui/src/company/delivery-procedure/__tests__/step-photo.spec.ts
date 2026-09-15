import { DELIVERY_STEP_PHOTO_LONG_EDGE, DELIVERY_STEP_PHOTO_MAX_BYTES } from '@lfd/contracts';

import {
  reduceStepPhoto,
  stepPhotoFrame,
  type StepPhotoEncoder,
  type StepPhotoFrame,
} from '../step-photo';

/** Un « blob » dont seul le poids compte — c'est tout ce que la réduction lit. */
function weighing(bytes: number): Blob {
  return { size: bytes } as Blob;
}

/** Un encodeur qui rend un poids par qualité, et note chaque passe. */
function encoder(weights: Readonly<Record<number, number | null>>): {
  readonly encode: StepPhotoEncoder;
  readonly passes: { frame: StepPhotoFrame; quality: number }[];
} {
  const passes: { frame: StepPhotoFrame; quality: number }[] = [];
  return {
    passes,
    encode: (frame, quality) => {
      passes.push({ frame, quality });
      const weight = weights[quality];
      return Promise.resolve(weight === null || weight === undefined ? null : weighing(weight));
    },
  };
}

describe('stepPhotoFrame', () => {
  it('borne le grand côté d’une photo de téléphone en portrait', () => {
    expect(stepPhotoFrame(3000, 4000)).toEqual({
      width: 1200,
      height: DELIVERY_STEP_PHOTO_LONG_EDGE,
    });
  });

  it('borne aussi bien en paysage', () => {
    expect(stepPhotoFrame(4000, 3000)).toEqual({
      width: DELIVERY_STEP_PHOTO_LONG_EDGE,
      height: 1200,
    });
  });

  it('n’agrandit jamais une image déjà plus petite', () => {
    expect(stepPhotoFrame(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('laisse intacte une image pile à la borne', () => {
    expect(stepPhotoFrame(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  it('préserve le rapport', () => {
    const frame = stepPhotoFrame(2448, 3264);
    expect(frame.width / frame.height).toBeCloseTo(2448 / 3264, 2);
  });

  it('ne rend jamais un côté nul pour une image très allongée', () => {
    expect(stepPhotoFrame(10000, 2)).toEqual({ width: DELIVERY_STEP_PHOTO_LONG_EDGE, height: 1 });
  });

  it('rend zéro pour une image qui ne mesure rien', () => {
    expect(stepPhotoFrame(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('reduceStepPhoto', () => {
  it('garde la première passe à 0.8 quand elle tient sous la borne', async () => {
    const { encode, passes } = encoder({ 0.8: 300_000 });

    const result = await reduceStepPhoto({ width: 4000, height: 3000 }, encode);

    expect(result).toEqual({ kind: 'ready', photo: weighing(300_000) });
    expect(passes).toEqual([{ frame: { width: 1600, height: 1200 }, quality: 0.8 }]);
  });

  it('accepte une photo pile au poids maximal', async () => {
    const { encode } = encoder({ 0.8: DELIVERY_STEP_PHOTO_MAX_BYTES });

    expect((await reduceStepPhoto({ width: 1000, height: 1000 }, encode)).kind).toBe('ready');
  });

  it('refait une passe à 0.6 quand la première dépasse 1 Mo', async () => {
    const { encode, passes } = encoder({ 0.8: DELIVERY_STEP_PHOTO_MAX_BYTES + 1, 0.6: 700_000 });

    const result = await reduceStepPhoto({ width: 4000, height: 3000 }, encode);

    expect(result).toEqual({ kind: 'ready', photo: weighing(700_000) });
    expect(passes.map((pass) => pass.quality)).toEqual([0.8, 0.6]);
  });

  it('refuse une photo encore trop lourde après la seconde passe, sans l’envoyer', async () => {
    const { encode, passes } = encoder({ 0.8: 2_000_000, 0.6: 1_500_000 });

    expect(await reduceStepPhoto({ width: 4000, height: 3000 }, encode)).toEqual({
      kind: 'too-heavy',
    });
    expect(passes).toHaveLength(2);
  });

  it('dit illisible quand le navigateur ne rend rien', async () => {
    const { encode } = encoder({ 0.8: null });

    expect(await reduceStepPhoto({ width: 1000, height: 800 }, encode)).toEqual({
      kind: 'unreadable',
    });
  });

  it('dit illisible sans peindre une image qui ne mesure rien', async () => {
    const { encode, passes } = encoder({ 0.8: 10 });

    expect(await reduceStepPhoto({ width: 0, height: 0 }, encode)).toEqual({ kind: 'unreadable' });
    expect(passes).toHaveLength(0);
  });
});
