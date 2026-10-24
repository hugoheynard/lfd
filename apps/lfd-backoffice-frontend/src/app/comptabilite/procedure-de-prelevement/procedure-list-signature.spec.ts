import { describe, expect, it } from 'vitest';

import { procedureRow } from '../__tests__/collection-procedure-fixture';
import { stageLabel } from './procedure-list-wording';

/** La table des procédures dit le lot déposé dont la signature n'est pas cochée (P3, 2026-10-24). */
describe('l’étape d’une procédure déposée sans signature attestée', () => {
  it('dit « déposé · signature à attester » sur l’onglet 3', () => {
    const row = procedureRow({ deposited: true, signatureToAttest: true });

    expect(stageLabel(row)).toBe('4 Fichier de prélèvement · déposé · signature à attester');
  });

  it('signée, ou pas encore déposée : l’étape seule', () => {
    expect(stageLabel(procedureRow())).toBe('4 Fichier de prélèvement');
    expect(stageLabel(procedureRow({ stage: 'returns', deposited: true }))).toBe(
      '5 Retours de la banque',
    );
  });
});
