import { describe, expect, it } from 'vitest';

import { procedureRow } from '../__tests__/collection-procedure-fixture';
import { rejectedByBankLabel } from './procedure-list-wording';

/** La table des procédures dit le fichier rejeté par la banque (plan `plan-lot-rejete-par-la-banque.md` § 7). */
describe('la ligne d’une procédure dont le fichier a été rejeté', () => {
  it('le dit, et invite à préparer de nouveau, tant qu’aucun lot vivant ne le remplace', () => {
    const rejected = procedureRow({
      batches: [{ id: 'b1', scheme: 'B2B', status: 'rejected_by_bank' }],
    });
    expect(rejectedByBankLabel(rejected)).toBe('Rejeté par la banque — préparer de nouveau');

    const replaced = procedureRow({
      batches: [
        { id: 'b1', scheme: 'B2B', status: 'rejected_by_bank' },
        { id: 'b2', scheme: 'B2B', status: 'constituted' },
      ],
    });
    expect(rejectedByBankLabel(replaced)).toBeNull();
    expect(rejectedByBankLabel(procedureRow())).toBeNull();
  });
});
