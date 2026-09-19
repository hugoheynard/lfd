import { JournalFactCheck } from "../journal-fact-check.js";

/**
 * La vérification du journal, **stricte** — celle que les doubles partagés
 * appliquent à ce qu'on leur confie.
 *
 * Les tests unitaires ne traversent pas l'adaptateur Prisma, seul endroit où
 * le catalogue des faits est confronté en service : sans cette ligne dans les
 * doubles, un handler pourrait écrire un type hors catalogue, ou une charge qui
 * ne suit pas son schéma, et ses tests resteraient verts jusqu'à l'e2e — ou
 * jusqu'au log d'erreur de la production.
 */
export const STRICT_JOURNAL_FACTS = new JournalFactCheck(true);
