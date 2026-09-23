/**
 * **Le laissez-passer d'écriture, et le journal qui le frappe.**
 *
 * La mécanique vivait dans `pim/journal/pim-journal.ts`, mêlée au vocabulaire
 * du référentiel. Elle monte ici le 2026-09-23, pour la raison que ce
 * fichier-là s'était donnée à lui-même : « **quand promouvoir le journal en
 * `platform/` : au troisième bloc émetteur** ». La médiathèque est le
 * troisième, et elle importait `PimJournal` — c'est-à-dire qu'un bloc
 * indépendant tenait sa garantie d'écriture d'un bloc voisin.
 *
 * 🔴 **Ce qui monte est la MÉCANIQUE, pas le vocabulaire.** Les faits
 * (`PIM_EVENTS`, `MEDIA_EVENTS`), les sujets et la portée restent chez celui
 * qui les prononce : un catalogue de faits centralisé obligerait chaque bloc à
 * demander la permission d'avoir une histoire.
 *
 * Ce que ce module ne sait pas, délibérément : où ça s'écrit, qui agit, quand,
 * ni comment l'idempotence se calcule. Il ne sait qu'une chose — **on n'écrit
 * pas sans avoir tracé** — et il la rend indiscutable.
 */

/**
 * La preuve, portée par le TYPE, qu'une trace a été inscrite.
 *
 * Les dépôts l'exigent en paramètre. Il ne peut naître que dans ce module —
 * `mint` n'est pas exporté et la marque est un symbole privé — donc la seule
 * façon d'en obtenir un est de passer par un {@link ScopedJournal}. Écrire sans
 * tracer ne se refuse plus en revue ni en CI : **ça ne compile pas**.
 *
 * C'est la différence entre le filet (`lint:journal-tracked`, qui vérifie qu'un
 * handler INJECTE un journal) et la garantie : injecter n'oblige pas à appeler.
 * Un ticket, si.
 *
 * ⚠️ **Un seul symbole pour tous les blocs**, et c'est assumé : un ticket frappé
 * par le journal du référentiel satisfait la signature d'un dépôt de la
 * médiathèque. Les distinguer demanderait un symbole par bloc, donc un type
 * générique de plus sur chaque port de dépôt — pour se prémunir d'un handler
 * qui injecterait le journal d'un AUTRE bloc, ce que la matrice des frontières
 * refuse déjà. Le ticket garantit « une trace a été écrite » ; c'est ce qu'il
 * promet, et il le tient.
 */
const TICKET = Symbol("platform.write-ticket");

export interface WriteTicket {
  readonly [TICKET]: true;
}

/** Frappe un laissez-passer. Privé au module : c'est toute la garantie. */
function mint(): WriteTicket {
  return { [TICKET]: true };
}

/**
 * Le journal d'un bloc — **bloquant**, et paramétré par ce que ce bloc dit.
 *
 * Bloquant : la trace part dans la même transaction que la décision qu'elle
 * décrit, donc une panne de journal annule l'enregistrement. C'est la
 * contrepartie assumée — le journal devient un point de panne du métier — et
 * c'est ce qui rend la trace **opposable** plutôt que probable.
 *
 * `TEntry` est le vocabulaire de l'émetteur : ses faits, ses sujets, sa portée.
 * Générique parce que chaque bloc a le sien et qu'aucun n'a à connaître celui
 * des autres — un `PimBlastRadius` compte des familles et des déclinaisons,
 * une médiathèque n'a rien de tel à figer.
 */
export abstract class ScopedJournal<TEntry> {
  /**
   * Inscrit le fait, et rend le laissez-passer qui autorise l'écriture.
   *
   * L'ordre n'a pas d'importance pour l'atomicité (tout est dans la même
   * transaction) ; il en a pour la LECTURE du code : on voit ce qu'on s'apprête
   * à affirmer avant de l'écrire.
   */
  async trace(entry: TEntry): Promise<WriteTicket> {
    await this.record(entry);
    return mint();
  }

  /**
   * Un laissez-passer **sans trace**, avec son motif.
   *
   * Toutes les écritures n'ont pas un fait à nommer, et certaines ne l'ont pas
   * ENCORE (cf. la dette de `lint:journal-tracked`). La dérogation existe donc
   * — mais il faut l'écrire, dire pourquoi, et ça se grep. Une exception
   * lisible vaut mieux qu'une règle contournée en silence : le but n'a jamais
   * été d'empêcher, il a toujours été de rendre visible.
   */
  untraced(reason: string): WriteTicket {
    void reason;
    return mint();
  }

  protected abstract record(entry: TEntry): Promise<void>;
}
