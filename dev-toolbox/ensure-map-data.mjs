#!/usr/bin/env node
/**
 * Prépare, une fois pour toutes par poste, ce dont la carte des tournées a
 * besoin en développement : le graphe routier servi par `lfd-dev-osrm`, et les
 * deux fichiers PMTiles que la config `development` du back-office sert depuis
 * `apps/lfd-backoffice-frontend/map-tiles/`.
 *
 * Appelé par `pnpm dev:infra` AVANT `docker compose up`. Idempotent : si tout
 * est là, il ne fait rien d'autre que le constater.
 *
 *   ~/.cache/lfd-map/graph/   savoie.osrm.* + savoie.osm.pbf (build-graph.sh)
 *   ~/.cache/lfd-map/tiles/   savoie.pmtiles + savoie-relief.pmtiles (build-tiles.sh)
 *   map-tiles/                rues.pmtiles + relief.pmtiles, découpés à la
 *                             Haute-Tarentaise : le front les lit EN ENTIER en
 *                             mémoire, la Savoie complète (~96 Mo) n'y a pas sa place.
 *
 * Le cache est HORS du dépôt : `build-graph.sh` refuse un dossier de sortie
 * dans le dépôt (contexte Docker), et un poste neuf ne retélécharge l'extrait
 * qu'une fois.
 *
 * Il n'échoue JAMAIS : sans réseau ou sans Docker, il avertit et rend la main,
 * parce que Postgres et MinIO doivent monter quoi qu'il arrive.
 *
 * Refabrication forcée : `--refresh` ou `LFD_MAP_REFRESH=1` (`pnpm dev:map:refresh`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, env } from "node:process";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(homedir(), ".cache", "lfd-map");
const GRAPH_DIR = join(CACHE, "graph");
const TILES_DIR = join(CACHE, "tiles");
const DEV_TILES_DIR = join(REPO_ROOT, "apps", "lfd-backoffice-frontend", "map-tiles");
const BUILD_GRAPH = join(REPO_ROOT, "apps", "lfd-osrm", "scripts", "build-graph.sh");
const BUILD_TILES = join(REPO_ROOT, "apps", "lfd-osrm", "scripts", "build-tiles.sh");
const OSRM_CONTAINER = "lfd-dev-osrm";

/** Haute-Tarentaise : le découpage que le front sait tenir en mémoire (~10 Mo). */
const DEV_BBOX = "6.62,45.40,7.06,45.67";
const STREETS_MAXZOOM = "14";
const RELIEF_MAXZOOM = "11";
/** Même digest que `build-tiles.sh` : la découpe sort du même outil que la carte. */
const PMTILES_IMAGE =
  "protomaps/go-pmtiles@sha256:06574f01f55a78f78f887bc7ebf729a5c093c0d6e17d9876300cfcb0758b59d3";

/** Dernier fichier écrit par `osrm-customize` : sa présence dit un graphe complet. */
const GRAPH_MARKERS = ["savoie.osrm.cell_metrics", "savoie.osm.pbf"];

const refresh = argv.includes("--refresh") || env.LFD_MAP_REFRESH === "1";

function warn(message) {
  console.warn(`⚠ carte : ${message}`);
}

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit" }).status === 0;
}

function quiet(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

function graphReady() {
  return GRAPH_MARKERS.every((file) => existsSync(join(GRAPH_DIR, file)));
}

function devTilesReady() {
  return ["rues.pmtiles", "relief.pmtiles"].every((file) => existsSync(join(DEV_TILES_DIR, file)));
}

/**
 * Fabrique dans un dossier voisin puis bascule par renommage : une
 * fabrication interrompue ne laisse jamais un cache à moitié écrit que la
 * passe suivante prendrait pour complet.
 */
function buildInto(target, build) {
  const staging = `${target}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  if (!build(staging)) {
    rmSync(staging, { recursive: true, force: true });
    return false;
  }
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  return true;
}

function ensureGraph() {
  if (graphReady() && !refresh) return true;
  console.log(
    "• carte : fabrication du graphe routier OSRM dans ~/.cache/lfd-map/graph — " +
      "téléchargement de l'extrait Rhône-Alpes puis préparation, compter 2 à 5 minutes (une fois par poste).",
  );
  // `build-graph.sh` vérifie son graphe sur le port 5055 : le service de dev doit le lâcher.
  quiet("docker", ["stop", OSRM_CONTAINER]);
  const built = buildInto(GRAPH_DIR, (staging) => run("bash", [BUILD_GRAPH, staging]));
  if (!built)
    warn(
      "graphe non fabriqué (réseau ? Docker ?). Le calcul routier restera indisponible ; relancer `pnpm dev:map:refresh`.",
    );
  return built;
}

function extractDevTiles(staging) {
  const volumes = ["-v", `${TILES_DIR}:/src:ro`, "-v", `${staging}:/out`];
  const extract = (source, output, maxzoom) =>
    run("docker", [
      "run",
      "--rm",
      ...volumes,
      PMTILES_IMAGE,
      "extract",
      `/src/${source}`,
      `/out/${output}`,
      `--bbox=${DEV_BBOX}`,
      `--maxzoom=${maxzoom}`,
    ]);
  mkdirSync(staging, { recursive: true });
  return (
    extract("savoie.pmtiles", "rues.pmtiles", STREETS_MAXZOOM) &&
    extract("savoie-relief.pmtiles", "relief.pmtiles", RELIEF_MAXZOOM)
  );
}

function ensureDevTiles() {
  if (devTilesReady() && !refresh) return;
  const pbf = join(GRAPH_DIR, "savoie.osm.pbf");
  if (!existsSync(pbf)) {
    warn("pas d'extrait savoie.osm.pbf en cache : tuiles non fabriquées, la carte restera vide.");
    return;
  }
  console.log(
    "• carte : fabrication des tuiles (rues + relief, découpe Haute-Tarentaise) — environ une minute.",
  );
  const cacheReady =
    !refresh &&
    ["savoie.pmtiles", "savoie-relief.pmtiles"].every((file) => existsSync(join(TILES_DIR, file)));
  const built =
    (cacheReady || buildInto(TILES_DIR, (staging) => run("bash", [BUILD_TILES, pbf, staging]))) &&
    buildInto(DEV_TILES_DIR, extractDevTiles);
  if (!built)
    warn(
      "tuiles non fabriquées (réseau ? Docker ?). La carte restera vide ; relancer `pnpm dev:map:refresh`.",
    );
}

function main() {
  if (!quiet("docker", ["info"])) {
    warn("Docker ne répond pas : carte et calcul routier non préparés.");
    return;
  }
  mkdirSync(CACHE, { recursive: true });
  ensureGraph();
  ensureDevTiles();
}

try {
  main();
} catch (error) {
  warn(`préparation interrompue (${error instanceof Error ? error.message : String(error)}).`);
}
