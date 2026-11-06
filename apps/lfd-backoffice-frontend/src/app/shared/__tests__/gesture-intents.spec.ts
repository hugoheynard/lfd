import { GestureIntents, INTENT_KEY_HEADER, intentOptions } from '../gesture-intents';

describe('GestureIntents — une clé par geste voulu (revue de S2, cas 4)', () => {
  it('rend la même clé tant que le geste n’a pas abouti : un double clic la renvoie', () => {
    const intents = new GestureIntents();
    expect(intents.keyFor('facture-1')).toBe(intents.keyFor('facture-1'));
  });

  it('fabrique une clé neuve après un geste abouti : un renvoi est une intention neuve', () => {
    const intents = new GestureIntents();
    const first = intents.keyFor('facture-1');
    intents.done('facture-1');
    expect(intents.keyFor('facture-1')).not.toBe(first);
  });

  it('tient une clé par sujet', () => {
    const intents = new GestureIntents();
    expect(intents.keyFor('a')).not.toBe(intents.keyFor('b'));
  });

  it('porte la clé dans l’en-tête que l’API lit', () => {
    expect(intentOptions('k-1').headers.get(INTENT_KEY_HEADER)).toBe('k-1');
  });
});
