import { actionsFor, LEAD_STAGE } from '../lead-stage';

describe('actionsFor', () => {
  it("propose d'avancer, convertir ou perdre un lead nouveau", () => {
    expect(actionsFor('new').map((action) => action.status)).toEqual([
      'contacted',
      'qualified',
      'negotiating',
      'converted',
      'lost',
    ]);
  });

  it('ne propose jamais de revenir en arrière', () => {
    expect(actionsFor('qualified').map((action) => action.status)).toEqual([
      'negotiating',
      'converted',
      'lost',
    ]);
    expect(actionsFor('negotiating').map((action) => action.status)).toEqual(['converted', 'lost']);
  });

  it('seule la perte est marquée comme destructrice', () => {
    expect(
      actionsFor('new')
        .filter((action) => action.danger)
        .map((a) => a.status),
    ).toEqual(['lost']);
  });
});

describe('LEAD_STAGE', () => {
  it("nomme les quatre étapes de la file dans l'ordre du pipeline", () => {
    expect(Object.values(LEAD_STAGE).map((stage) => stage.label)).toEqual([
      'Nouveau',
      'Contacté',
      'Qualifié',
      'En négociation',
    ]);
  });
});
