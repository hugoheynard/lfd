import { isDeadlineTime, withDeadline, withoutDeadline } from '../deadline-list.model';

/** La liste d'échéances du carnet : triée, sans doublon, par construction. */
describe('liste d’échéances', () => {
  it('range une échéance ajoutée à sa place', () => {
    expect(withDeadline(['06:00', '11:00'], '08:30')).toEqual(['06:00', '08:30', '11:00']);
  });

  it('n’ajoute pas deux fois la même heure', () => {
    expect(withDeadline(['06:00'], '06:00')).toEqual(['06:00']);
  });

  it('ignore une heure illisible — un champ vidé n’ajoute rien', () => {
    expect(withDeadline(['06:00'], '')).toEqual(['06:00']);
    expect(withDeadline(['06:00'], '24:00')).toEqual(['06:00']);
  });

  it('retire une échéance', () => {
    expect(withoutDeadline(['06:00', '11:00'], '06:00')).toEqual(['11:00']);
  });

  it('lit une heure au format du contrat', () => {
    expect(isDeadlineTime('06:00')).toBe(true);
    expect(isDeadlineTime('6:00')).toBe(false);
  });
});
