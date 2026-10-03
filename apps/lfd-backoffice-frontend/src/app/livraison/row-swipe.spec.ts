import { neighbourRow, SWIPE_MIN_PX, swipeStep } from './row-swipe';

describe('swipeStep', () => {
  it('vers la gauche avance vers les portes, vers la droite revient au fond', () => {
    expect(swipeStep(-80, 0)).toBe(1);
    expect(swipeStep(80, 0)).toBe(-1);
  });

  it('un geste trop court est un toucher, pas un glissement', () => {
    expect(swipeStep(-(SWIPE_MIN_PX - 1), 0)).toBe(0);
  });

  it('un geste surtout vertical est un défilement de page', () => {
    expect(swipeStep(-80, 70)).toBe(0);
  });
});

describe('neighbourRow', () => {
  const rows = [1, 2, 3];

  it('donne la rangée voisine dans le sens du geste', () => {
    expect(neighbourRow(rows, 1, 1)).toBe(2);
    expect(neighbourRow(rows, 3, -1)).toBe(2);
  });

  it('ne boucle pas au bout', () => {
    expect(neighbourRow(rows, 3, 1)).toBeNull();
    expect(neighbourRow(rows, 1, -1)).toBeNull();
  });

  it('ne bouge pas sans geste, sans rangée ouverte, ou sur une rangée inconnue', () => {
    expect(neighbourRow(rows, 2, 0)).toBeNull();
    expect(neighbourRow(rows, null, 1)).toBeNull();
    expect(neighbourRow(rows, 9, 1)).toBeNull();
  });
});
