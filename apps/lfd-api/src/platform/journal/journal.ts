/**
 * Le **journal**, vu par la plateforme : un fait, et rien d'autre.
 *
 * Le port a longtemps vécu dans `pim/journal/`, avec sa mécanique propre (le
 * laissez-passer, la portée). Il vit ici depuis que le référentiel n'est plus
 * le seul à écrire des faits : c'était la règle que ce port s'était donnée à
 * lui-même — « au troisième bloc émetteur, la fiction *la croissance possède le
 * journal* ne tient plus ».
 *
 * Ce qu'il ne sait pas, délibérément : où ça s'écrit (une table de `growth`),
 * qui agit (le contexte de requête le porte), quand (l'horloge), ni comment
 * l'idempotence se calcule. L'adaptateur de la racine de composition s'en
 * charge — c'est lui qui connaît les deux rives.
 */
import type { JournalFact } from "./journal-fact.js";

export abstract class Journal {
  /**
   * Inscrit le fait, **bloquant** : une panne remonte à l'appelant, donc annule
   * la transaction qui l'englobe. C'est ce qui rend la trace opposable plutôt
   * que probable — et c'est un choix par chemin d'écriture, pas un réglage
   * global : le journal analytique de `growth` reste best-effort (cf.
   * `ActivityRecorder.record`).
   */
  abstract append(fact: JournalFact): Promise<void>;
}
