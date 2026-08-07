import { resolveClientIp } from '../client-ip.js';

/**
 * Le tracker du rate limiting doit clé sur l'IP **réelle** du client, pas sur
 * l'IP de l'infra Cloudflare (sinon tout le monde partage un compteur).
 */
describe('resolveClientIp', () => {
  it('prend `x-lfc-client-ip` (propagée par la gateway) en priorité', () => {
    const req = {
      headers: {
        'x-lfc-client-ip': '203.0.113.7',
        'cf-connecting-ip': '10.0.0.1',
      },
      ip: '127.0.0.1',
    };
    expect(resolveClientIp(req)).toBe('203.0.113.7');
  });

  it('retombe sur `cf-connecting-ip` en accès direct', () => {
    const req = {
      headers: { 'cf-connecting-ip': '198.51.100.9' },
      ip: '127.0.0.1',
    };
    expect(resolveClientIp(req)).toBe('198.51.100.9');
  });

  it('retombe sur `req.ip` en dev local', () => {
    expect(resolveClientIp({ headers: {}, ip: '192.168.1.5' })).toBe(
      '192.168.1.5',
    );
  });

  it('retourne `unknown` en dernier recours', () => {
    expect(resolveClientIp({ headers: {} })).toBe('unknown');
  });

  it('ignore un en-tête vide et passe à la source suivante', () => {
    const req = {
      headers: { 'x-lfc-client-ip': '', 'cf-connecting-ip': '203.0.113.42' },
    };
    expect(resolveClientIp(req)).toBe('203.0.113.42');
  });

  it('prend la première valeur si l’en-tête est un tableau', () => {
    const req = {
      headers: { 'x-lfc-client-ip': ['203.0.113.1', '203.0.113.2'] },
    };
    expect(resolveClientIp(req)).toBe('203.0.113.1');
  });

  it('ne se laisse pas berner par un `headers` absent ou non-objet', () => {
    expect(resolveClientIp({ ip: '10.1.1.1' })).toBe('10.1.1.1');
    expect(resolveClientIp({ headers: null, ip: '10.1.1.2' })).toBe('10.1.1.2');
  });
});
