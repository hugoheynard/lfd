#!/usr/bin/env bash
# Fabrique les deux fichiers de la carte des tournées (plan de tournée, lot 10
# — L10-C2) : les rues de la Savoie en tuiles vectorielles, et le relief.
#
#   apps/lfd-route-planner/scripts/build-tiles.sh <savoie.osm.pbf> <dossier-de-sortie>
#
# L'extrait est LE MÊME que celui du graphe OSRM (`build-graph.sh` le laisse
# dans son dossier de sortie) : la carte et les durées lisent la même route.
#
# Sortie :
#   savoie.pmtiles         rues, bâtiments, eau, couverture du sol — schéma
#                          OpenMapTiles, z0–14, rangé (`cluster`) pour être lu
#                          par plages depuis R2. 36 Mo le 2026-09-29.
#   savoie-relief.pmtiles  modèle d'altitude Mapterhorn (terrarium, webp),
#                          z0–12, découpé au même cadre. 60 Mo le 2026-09-29.
#
# Mesuré le 2026-09-29 sur un Mac : 11 s pour les rues, 6 s pour le relief
# (63 Mo transférés par requêtes partielles, jamais le fichier planétaire).
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage : $0 <savoie.osm.pbf> <dossier-de-sortie>" >&2
  exit 2
fi

PBF="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
mkdir -p "$2"
OUT="$(cd "$2" && pwd)"

# Le cadre de la Savoie, large : La Rosière au nord-est, Modane au sud.
# Longitude min, latitude min, longitude max, latitude max.
BBOX="5.60,45.03,7.20,45.95"
# Épinglés par digest, comme l'image OSRM (`osrm-version.env`) : une carte
# refabriquée le mois prochain doit sortir du même outil. Relevés le 2026-09-29.
TILEMAKER_IMAGE="ghcr.io/systemed/tilemaker@sha256:d3eda2790458de727bb0096eebce775984fc060f60901dac6dbfbbb79ae17370"
PMTILES_IMAGE="protomaps/go-pmtiles@sha256:06574f01f55a78f78f887bc7ebf729a5c093c0d6e17d9876300cfcb0758b59d3"
RELIEF_SOURCE="https://download.mapterhorn.com/planet.pmtiles"

cp "$PBF" "$OUT/savoie.osm.pbf"

echo "▸ Rues (tilemaker, schéma OpenMapTiles)"
docker run --rm -v "$OUT:/data" "$TILEMAKER_IMAGE" \
  /data/savoie.osm.pbf --output /data/savoie.pmtiles --bbox "$BBOX" >"$OUT/tilemaker.log" 2>&1
# tilemaker n'écrit pas les tuiles dans l'ordre : sans `cluster`, un
# navigateur lirait le répertoire en entier avant la première tuile.
docker run --rm -v "$OUT:/data" "$PMTILES_IMAGE" cluster /data/savoie.pmtiles

echo "▸ Relief (Mapterhorn, découpé au cadre)"
docker run --rm -v "$OUT:/data" "$PMTILES_IMAGE" \
  extract "$RELIEF_SOURCE" /data/savoie-relief.pmtiles --bbox="$BBOX" --maxzoom=12

rm -f "$OUT/savoie.osm.pbf"

# Une carte vide ne doit pas partir : chaque fichier doit annoncer ses zooms.
for file in savoie.pmtiles savoie-relief.pmtiles; do
  # Capturé d'abord : `grep -q` fermerait le tube, et `pipefail` y verrait un échec.
  header="$(docker run --rm -v "$OUT:/data" "$PMTILES_IMAGE" show "/data/$file")"
  if [[ "$header" != *"max zoom"* ]]; then
    echo "❌ $file illisible." >&2
    exit 1
  fi
done
ls -la "$OUT"/*.pmtiles
echo "✅ Tuiles prêtes dans $OUT"
