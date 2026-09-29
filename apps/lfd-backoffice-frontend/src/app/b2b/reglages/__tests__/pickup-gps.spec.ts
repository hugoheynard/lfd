import { describe, expect, it } from 'vitest';

import { EMPTY_GPS, gpsDraftFrom, gpsIssue, toGps } from '../pickup-gps';

describe('le point GPS d’un point de retrait', () => {
  it('lit un absent comme un point sans GPS', () => {
    expect(gpsDraftFrom(undefined)).toEqual(EMPTY_GPS);
    expect(gpsDraftFrom(null)).toEqual(EMPTY_GPS);
    expect(gpsDraftFrom({ lat: 48.85, lng: 2.37 })).toEqual({ lat: 48.85, lng: 2.37 });
  });

  it('accepte les deux vides, et les envoie comme un effacement', () => {
    expect(gpsIssue(EMPTY_GPS)).toBe('');
    expect(toGps(EMPTY_GPS)).toBeNull();
  });

  it('refuse une moitié de point', () => {
    expect(gpsIssue({ lat: 48.85, lng: null })).toContain('ET la longitude');
    expect(gpsIssue({ lat: null, lng: 2.37 })).toContain('ET la longitude');
  });

  it('refuse ce qui sort des bornes du contrat', () => {
    expect(gpsIssue({ lat: 91, lng: 0 })).toContain('latitude');
    expect(gpsIssue({ lat: 0, lng: -181 })).toContain('longitude');
    expect(gpsIssue({ lat: -90, lng: 180 })).toBe('');
  });

  it('envoie un point complet tel quel', () => {
    expect(toGps({ lat: 48.85, lng: 2.37 })).toEqual({ lat: 48.85, lng: 2.37 });
  });
});
