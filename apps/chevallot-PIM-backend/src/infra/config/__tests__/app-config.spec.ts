import { AppConfig } from '../app-config.js';

const REQUIRED = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  AUTH0_DOMAIN: 'tenant.eu.auth0.com',
  AUTH0_AUDIENCE: 'https://api.test',
};

describe('AppConfig', () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const [key, value] of Object.entries(REQUIRED)) {
      process.env[key] = value;
    }
    delete process.env['PORT'];
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('expose les valeurs requises', () => {
    const config = new AppConfig();
    expect(config.databaseUrl()).toBe(REQUIRED.DATABASE_URL);
    expect(config.auth0Domain()).toBe(REQUIRED.AUTH0_DOMAIN);
    expect(config.auth0Audience()).toBe(REQUIRED.AUTH0_AUDIENCE);
  });

  it.each(Object.keys(REQUIRED))('échoue si %s manque', (key) => {
    delete process.env[key];
    expect(() => new AppConfig()).toThrow(key);
  });

  it('rejette une variable requise vide', () => {
    process.env['DATABASE_URL'] = '   ';
    expect(() => new AppConfig()).toThrow('DATABASE_URL');
  });

  it('retombe sur le port 3100 par défaut', () => {
    expect(new AppConfig().port()).toBe(3100);
  });

  it('lit le port quand il est défini', () => {
    process.env['PORT'] = '4000';
    expect(new AppConfig().port()).toBe(4000);
  });

  it.each(['0', '70000', 'abc'])('rejette un port invalide (%s)', (raw) => {
    process.env['PORT'] = raw;
    expect(() => new AppConfig()).toThrow('PORT');
  });
});
