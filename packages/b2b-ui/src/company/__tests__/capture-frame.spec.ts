import { captureFileName, frameSize, MAX_LONG_EDGE } from '../kbis-capture-panel/capture-frame';

describe('frameSize', () => {
  it("borne le grand côté d'une photo en portrait", () => {
    // Le capteur d'un téléphone récent rend du 3000×4000 et plusieurs Mo ; le
    // serveur refuse au-delà de 10 Mo, et le refus arrive APRÈS la photo.
    expect(frameSize(3000, 4000)).toEqual({ width: 1800, height: MAX_LONG_EDGE });
  });

  it('borne aussi bien en paysage', () => {
    expect(frameSize(4000, 3000)).toEqual({ width: MAX_LONG_EDGE, height: 1800 });
  });

  it("n'agrandit jamais une image déjà plus petite", () => {
    // On n'invente pas des pixels que le capteur n'a pas vus : une image
    // agrandie paraît nette de loin et ne se certifie pas de près.
    expect(frameSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('préserve le rapport', () => {
    const size = frameSize(1200, 1600);
    expect(size.width / size.height).toBeCloseTo(1200 / 1600, 3);
  });

  it('rend zéro quand le flux ne mesure encore rien', () => {
    // `videoWidth` vaut 0 tant que la première image n'est pas arrivée :
    // déclencher à cet instant ne doit produire aucun fichier.
    expect(frameSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('captureFileName', () => {
  it('porte le jour de la prise de vue', () => {
    expect(captureFileName(new Date(2026, 8, 12))).toBe('kbis-2026-09-12.jpg');
  });

  it('complète les mois et jours à deux chiffres', () => {
    expect(captureFileName(new Date(2026, 0, 5))).toBe('kbis-2026-01-05.jpg');
  });
});
