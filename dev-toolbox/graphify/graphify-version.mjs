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
