import { describe, expect, it } from 'vitest';

import {
  REASON_LABELS,
  blockersOf,
  exclusionIndex,
  faultsOf,
  isChannelClosed,
  reasonLabel,
} from '../b2b-exclusions';

/** Une fiche et sa déclinaison, dans la forme minimale que ces fonctions lisent. */
const PRODUCT = {
  sku: 'P-8EMFGZ',
  status: 'published',
  variants: [{ sku: 'P-8EMFGZ-1' }, { sku: 'P-8EMFGZ-2' }],
};

const BROUILLON = { ...PRODUCT, status: 'draft' };

describe('les refus de la projection B2B, vus de la table', () => {
  it('remonte le refus de la fiche AVANT celui de ses déclinaisons', () => {
    const index = exclusionIndex([
      { sku: 'P-8EMFGZ-1', reason: 'variant_sans_prix' },
      { sku: 'P-8EMFGZ', reason: 'produit_sans_variante_vendable' },
    ]);

    // La conséquence d'abord, la cause ensuite : c'est l'ordre dans lequel on
    // lit une ligne, pas celui dans lequel l'aperçu les a émis.
    expect(blockersOf(PRODUCT, index).map((blocker) => blocker.sku)).toEqual([
      'P-8EMFGZ',
      'P-8EMFGZ-1',
    ]);
  });

  it('garde l’ordre des déclinaisons de la fiche', () => {
    const index = exclusionIndex([
      { sku: 'P-8EMFGZ-2', reason: 'variant_sans_taux' },
      { sku: 'P-8EMFGZ-1', reason: 'variant_sans_prix' },
    ]);

    expect(blockersOf(PRODUCT, index).map((blocker) => blocker.sku)).toEqual([
      'P-8EMFGZ-1',
      'P-8EMFGZ-2',
    ]);
  });

  /**
   * L'aperçu ne couvre que les fiches dont le canal est ouvert : une fiche
   * jamais mise en vente aux pros n'y figure pas, et n'a donc rien à dire.
   */
  it('ne dit rien d’une fiche absente de l’aperçu', () => {
    expect(blockersOf(PRODUCT, exclusionIndex([]))).toEqual([]);
  });

  it('distingue le refus de la fiche de celui d’une déclinaison', () => {
    const index = exclusionIndex([
      { sku: 'P-8EMFGZ', reason: 'famille_inconnue' },
      { sku: 'P-8EMFGZ-1', reason: 'variant_sans_prix' },
    ]);
    const [whole, partial] = blockersOf(PRODUCT, index);

    expect(whole?.wholeProduct).toBe(true);
    expect(partial?.wholeProduct).toBe(false);
  });
});

describe('la décision de ne pas vendre aux pros', () => {
  const closed = blockersOf(PRODUCT, exclusionIndex([{ sku: 'P-8EMFGZ', reason: 'canal_ferme' }]));

  it('se reconnaît', () => {
    expect(isChannelClosed(closed)).toBe(true);
  });

  /**
   * Régression : le badge de la colonne B2B affichait « jamais poussée » en
   * orange sur une fiche que la matrice refuse — une étape en attente là où il
   * y a un refus définitif. Le badge la porte désormais ; la note sous la ligne
   * ne doit donc PAS la répéter.
   */
  it('ne descend pas dans la note de ligne', () => {
    expect(faultsOf(closed)).toEqual([]);
  });

  it('laisse passer les vrais manques', () => {
    const mixed = blockersOf(
      PRODUCT,
      exclusionIndex([
        { sku: 'P-8EMFGZ', reason: 'canal_ferme' },
        { sku: 'P-8EMFGZ-1', reason: 'variant_sans_prix' },
      ]),
    );

    expect(faultsOf(mixed).map((blocker) => blocker.sku)).toEqual(['P-8EMFGZ-1']);
  });

  it('ne se déclenche pas sur un autre motif', () => {
    const other = blockersOf(
      PRODUCT,
      exclusionIndex([{ sku: 'P-8EMFGZ', reason: 'produit_sans_variante_vendable' }]),
    );

    expect(isChannelClosed(other)).toBe(false);
  });
});

describe('la traduction des motifs', () => {
  it('dit en français ceux qu’elle connaît', () => {
    expect(reasonLabel('variant_sans_prix')).toBe('pas de tarif');
    expect(reasonLabel('produit_sans_variante_vendable')).toBe('aucune déclinaison vendable');
    expect(reasonLabel('canal_ferme')).toBe('non vendue aux professionnels');
  });

  /**
   * Le motif voyage en CHAÎNE dans `B2bPushPreviewView` : le référentiel peut
   * en émettre un que le back-office ne connaît pas encore. Le montrer tel quel
   * est moins grave que de l'effacer — une exclusion sans motif se lit comme un
   * bug de l'écran.
   */
  it('montre tel quel un motif inconnu plutôt que de l’effacer', () => {
    expect(reasonLabel('motif_invente_par_le_referentiel')).toBe(
      'motif_invente_par_le_referentiel',
    );
  });

  it('en a un pour chaque motif du contrat', () => {
    for (const [reason, label] of Object.entries(REASON_LABELS)) {
      expect(label, `« ${reason} » n'est pas traduit`).not.toBe('');
    }
  });
});

describe('le brouillon vendu aux professionnels', () => {
  /**
   * 🔴 Le motif que le serveur ne peut PAS produire : la projection B2B ne
   * consulte jamais le statut de la fiche. Un brouillon dont le canal est
   * ouvert n'est pas écarté — il PART. Aucun aperçu ne le dira, puisque rien ne
   * l'exclut ; c'est l'écran qui doit le voir.
   */
  it('signale un brouillon dont le canal est ouvert', () => {
    const blockers = blockersOf(BROUILLON, exclusionIndex([]), true);

    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.label).toBe('brouillon, et pourtant vendu aux pros');
    expect(blockers[0]?.wholeProduct).toBe(true);
  });

  /** Hors canal, il ne part nulle part : il n'y a rien à signaler. */
  it('se tait sur un brouillon hors canal', () => {
    expect(blockersOf(BROUILLON, exclusionIndex([]), false)).toEqual([]);
  });

  it('se tait sur une fiche en vente, canal ouvert', () => {
    expect(blockersOf(PRODUCT, exclusionIndex([]), true)).toEqual([]);
  });

  /**
   * Il vient EN PREMIER, et ce n'est pas un ordre d'affichage : les autres
   * motifs disent pourquoi une fiche ne partira pas, celui-ci dit qu'elle part
   * alors qu'elle ne devrait pas. On lit l'anomalie avant le manque.
   */
  it('passe devant les motifs de la projection', () => {
    const blockers = blockersOf(
      BROUILLON,
      exclusionIndex([{ sku: 'P-8EMFGZ-1', reason: 'variant_sans_prix' }]),
      true,
    );

    expect(blockers.map((b) => b.label)).toEqual([
      'brouillon, et pourtant vendu aux pros',
      'pas de tarif',
    ]);
  });

  /** Ce n'est PAS une décision comme « non vendue aux pros » : il descend dans la note. */
  it('descend dans la note de ligne', () => {
    expect(faultsOf(blockersOf(BROUILLON, exclusionIndex([]), true))).toHaveLength(1);
  });
});
