import type { Company } from "../entities/company.js";

/**
 * Port d'écriture **étroit** : persiste le seul code NAF d'une société.
 *
 * Il existe parce que la résolution du NAF attend une API externe, en tâche de
 * fond, pendant que le staff peut activer la société ou lui accorder un terme.
 * `CompanyRepository.save` réécrit TOUTES les colonnes mutables depuis
 * l'agrégat chargé : porté par cet abonné, il remettait la société `pending`,
 * sans terme, dès que la réponse arrivait après l'activation (constaté le
 * 2026-10-01 — 13 maisons sur 15 du semis restées « en attente »).
 *
 * Le NAF ne porte aucun invariant croisé avec le reste de l'agrégat (statut,
 * termes, contact) : sa seule règle — normaliser un texte facultatif — vit dans
 * `Company.assignNaf`, appelé avant ce port. Une écriture ciblée ne perd donc
 * rien, comme `OrderRepository.markPaid`. Un verrou `FOR UPDATE` n'aurait servi
 * à rien ici : aucun autre écrivain de `Company` ne verrouille (vérifié le
 * 2026-10-01), et il aurait fallu les y faire tous passer pour une colonne que
 * personne d'autre ne touche.
 *
 * Il prend l'agrégat, pas une chaîne : la valeur écrite est celle que la
 * méthode métier a validée.
 */
export abstract class CompanyNafWriter {
  abstract saveNaf(company: Company): Promise<void>;
}
