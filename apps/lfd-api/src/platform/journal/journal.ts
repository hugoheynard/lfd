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

  /**
   * Inscrit plusieurs faits, **bloquant** et tout ou rien comme {@link append}.
   *
   * Par défaut, un par un : un adaptateur qui sait écrire en lot le
   * surcharge. Ajouté le 2026-10-17, après qu'une validation de 64 articles a
   * fait expirer sa transaction (P2028) à raison de deux allers-retours par fait.
   */
  async appendAll(facts: readonly JournalFact[]): Promise<void> {
    for (const fact of facts) {
      await this.append(fact);
    }
  }
}
