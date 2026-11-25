import { EVENT_FUNCTION_SHEET_MAX_BYTES } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { applicationsLabel, eventDayLabel, sheetRefusal } from './event-format';

function fileOf(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('sheetRefusal', () => {
  it('laisse partir un PDF sous la borne', () => {
    expect(sheetRefusal(fileOf('fiche.pdf', 'application/pdf', 1000))).toBeNull();
  });

  it('accepte un .pdf dont le navigateur ne dit pas le type', () => {
    expect(sheetRefusal(fileOf('fiche.PDF', '', 1000))).toBeNull();
  });

  it('refuse un Excel en disant de l’exporter en PDF', () => {
    const file = fileOf(
      'fiche.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      1000,
    );
    expect(sheetRefusal(file)).toContain('exportez la fiche en PDF');
  });

  it('refuse au-delà de la borne, et la laisse passer à la borne', () => {
    const max = EVENT_FUNCTION_SHEET_MAX_BYTES;
    expect(sheetRefusal(fileOf('f.pdf', 'application/pdf', max))).toBeNull();
    expect(sheetRefusal(fileOf('f.pdf', 'application/pdf', max + 1))).toContain('20 Mo');
  });
});

describe('les libellés', () => {
  it('nomme les applications connues et garde les autres telles quelles', () => {
    expect(applicationsLabel(['lafoliecoffee', 'autre'])).toBe('La Folie Coffee, autre');
  });

  it('dit le jour sans glisser d’un fuseau', () => {
    expect(eventDayLabel('2026-12-12')).toBe('samedi 12 décembre 2026');
  });
});
