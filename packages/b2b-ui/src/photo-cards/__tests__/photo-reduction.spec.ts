import {
  photoFrame,
  reducePhoto,
  type PhotoEncoder,
  type PhotoReductionPolicy,
} from '../photo-reduction';

/**
 * Une politique délibérément différente de celle de la procédure (1600 px,
 * 0.8 puis 0.6, 1 Mo) : trois passes, un autre grand côté, un autre plafond.
 * Une valeur de la procédure restée en dur dans le socle échouerait ici.
 */
const POLICY: PhotoReductionPolicy = {
  longEdge: 2400,
  qualities: [0.75, 0.6, 0.5],
  maxBytes: 600_000,
};

function weighing(bytes: number): Blob {
  return { size: bytes } as Blob;
}

function encoder(weights: Readonly<Record<number, number | null>>): {
  readonly encode: PhotoEncoder;
  readonly qualities: number[];
} {
  const qualities: number[] = [];
  return {
    qualities,
    encode: (_frame, quality) => {
      qualities.push(quality);
      const weight = weights[quality];
      return Promise.resolve(weight === null || weight === undefined ? null : weighing(weight));
    },
  };
}

describe('photoFrame', () => {
  it('borne le grand côté à celui qu’on lui passe', () => {
    expect(photoFrame(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400 });
    expect(photoFrame(4000, 3000, 320)).toEqual({ width: 320, height: 240 });
  });

  it('n’agrandit jamais, et ne rend rien pour une image vide', () => {
    expect(photoFrame(800, 600, 2400)).toEqual({ width: 800, height: 600 });
    expect(photoFrame(0, 0, 2400)).toEqual({ width: 0, height: 0 });
  });
});

describe('reducePhoto', () => {
  it('peint au grand côté de la politique, à sa première qualité', async () => {
    const passes: { width: number; height: number; quality: number }[] = [];
    const encode: PhotoEncoder = (frame, quality) => {
      passes.push({ ...frame, quality });
      return Promise.resolve(weighing(100));
    };

    expect((await reducePhoto({ width: 4000, height: 3000 }, encode, POLICY)).kind).toBe('ready');
    expect(passes).toEqual([{ width: 2400, height: 1800, quality: 0.75 }]);
  });

  it('essaie TOUTES les qualités dans l’ordre, jusqu’à tenir sous le plafond', async () => {
    const { encode, qualities } = encoder({ 0.75: 900_000, 0.6: 700_000, 0.5: POLICY.maxBytes });

    expect(await reducePhoto({ width: 4000, height: 3000 }, encode, POLICY)).toEqual({
      kind: 'ready',
      photo: weighing(POLICY.maxBytes),
    });
    expect(qualities).toEqual([0.75, 0.6, 0.5]);
  });

  it('renonce après la dernière passe encore trop lourde', async () => {
    const { encode, qualities } = encoder({ 0.75: 900_000, 0.6: 800_000, 0.5: 600_001 });

    expect(await reducePhoto({ width: 4000, height: 3000 }, encode, POLICY)).toEqual({
      kind: 'too-heavy',
    });
    expect(qualities).toHaveLength(3);
  });

  it('dit illisible quand le navigateur ne rend rien, ou sans rien peindre d’une image vide', async () => {
    expect(
      (await reducePhoto({ width: 10, height: 10 }, encoder({ 0.75: null }).encode, POLICY)).kind,
    ).toBe('unreadable');
    const empty = encoder({ 0.75: 1 });
    expect((await reducePhoto({ width: 0, height: 0 }, empty.encode, POLICY)).kind).toBe(
      'unreadable',
    );
    expect(empty.qualities).toHaveLength(0);
  });
});
