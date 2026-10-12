/**
 * La version de graphify que le dépôt installe — en UN seul endroit.
 *
 * 🔴 Épinglée exacte, jamais une plage : l'installation part toute seule au
 * `pnpm install` de chaque poste, et une version non épinglée ferait entrer
 * sur toutes les machines ce qu'un tiers publie demain, sans relecture. Une
 * montée de version est un commit.
 *
 * Paquet PyPI `graphifyy` (deux « y »), dépôt Graphify-Labs/graphify (ex
 * safishamsi/graphify), Apache-2.0 + MIT — vérifié le 2026-10-12 sur PyPI,
 * GitHub et pepy (8,4 M de téléchargements).
 */
export const GRAPHIFY_PACKAGE = "graphifyy";
export const GRAPHIFY_VERSION = "0.9.86";

/**
 * Les extras du paquet. `sql` installe l'extracteur des `.sql` : sans lui,
 * les 353 migrations et le schéma n'entrent pas dans le graphe (constaté au
 * premier graphe, 2026-10-12).
 */
export const GRAPHIFY_EXTRAS = ["sql"];

/**
 * Le Python de l'outil, épinglé : sans lui, uv prend celui du shell — 3.9
 * sous la base micromamba de Hugo, que graphify refuse (il veut ≥ 3.10,
 * constaté le 2026-10-12). uv télécharge ce Python s'il manque au poste.
 */
export const GRAPHIFY_PYTHON = "3.12";

/** Ce qu'on passe à `uv tool install` : `graphifyy[sql]==0.9.86`. */
export const GRAPHIFY_SPEC = `${GRAPHIFY_PACKAGE}[${GRAPHIFY_EXTRAS.join(",")}]==${GRAPHIFY_VERSION}`;
