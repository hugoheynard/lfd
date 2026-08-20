import { describe, expect, it } from 'vitest';

import { pushStateOf, vapidKeyToBytes } from '../web-push';

const FACTS = {
  supported: true,
  publicKey:
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  installed: true,
  ios: false,
  permission: 'default' as NotificationPermission,
  subscribed: false,
};

describe('ce que l’écran doit dire', () => {
  it('parle du navigateur AVANT de parler du serveur', () => {
    // L'ordre des murs compte : dire « le serveur n'a pas de clé » à quelqu'un
    // dont le navigateur ne sait pas faire l'enverrait chercher au mauvais
    // endroit.
    expect(pushStateOf({ ...FACTS, supported: false, publicKey: null })).toBe('unsupported');
  });

  it('dit « non configuré » quand le serveur n’a pas de paire VAPID', () => {
    expect(pushStateOf({ ...FACTS, publicKey: null })).toBe('unconfigured');
  });

  it('réclame l’installation sur iOS, et seulement sur iOS', () => {
    // La règle d'Apple depuis 16.4 : Web Push seulement pour un site ajouté à
    // l'écran d'accueil. Ailleurs, un onglet ordinaire suffit — et Safari
    // échoue en SILENCE, d'où l'intérêt de le dire.
    expect(pushStateOf({ ...FACTS, ios: true, installed: false })).toBe('needs-install');
    expect(pushStateOf({ ...FACTS, ios: false, installed: false })).toBe('available');
  });

  it('n’offre pas un bouton après un refus — il ne redemanderait rien', () => {
    expect(pushStateOf({ ...FACTS, permission: 'denied' })).toBe('denied');
  });

  it('distingue abonné et abonnable', () => {
    expect(pushStateOf({ ...FACTS, permission: 'granted', subscribed: true })).toBe('subscribed');
    expect(pushStateOf({ ...FACTS, permission: 'granted', subscribed: false })).toBe('available');
  });
});

describe('la clé VAPID', () => {
  it('décode le base64url et rétablit le rembourrage', () => {
    // Une clé VAPID fait 65 octets (0x04 + deux coordonnées de 32). `atob`
    // refuserait la chaîne telle quelle : sa longueur n'est pas un multiple
    // de quatre, et elle porte des `-`/`_` que le base64 standard ignore.
    const bytes = vapidKeyToBytes(FACTS.publicKey);

    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });
});
