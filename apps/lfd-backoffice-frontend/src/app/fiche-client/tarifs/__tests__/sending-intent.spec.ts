import { describe, expect, it } from 'vitest';

import { SendingIntent } from '../sending-intent';

describe('SendingIntent — la clé d’un envoi de mercuriale', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

  it('fabrique un UUID dès l’ouverture, et le renvoie pour le même envoi', () => {
    const intent = new SendingIntent();
    const first = intent.keyFor({ label: 'Été' });
    expect(first).toMatch(UUID);
    expect(intent.keyFor({ label: 'Été' })).toBe(first);
  });

  it('un refus garde la clé : le réessai du même envoi la renvoie', () => {
    const intent = new SendingIntent();
    const first = intent.keyFor({ label: 'Été' });
    // Aucun `done()` : l’envoi a échoué.
    expect(intent.keyFor({ label: 'Été' })).toBe(first);
  });

  it('une saisie qui change fait une intention neuve', () => {
    const intent = new SendingIntent();
    const first = intent.keyFor({ label: 'Été' });
    expect(intent.keyFor({ label: 'Hiver' })).not.toBe(first);
  });

  it('après un succès, le prochain envoi, même identique, est une intention neuve', () => {
    const intent = new SendingIntent();
    const first = intent.keyFor({ label: 'Été' });
    intent.done();
    expect(intent.keyFor({ label: 'Été' })).not.toBe(first);
  });
});
