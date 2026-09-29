#!/usr/bin/env bash
# Prépare le graphe routier de la Savoie pour `lfd-osrm` (plan de tournée,
# lot 8 — L8-C4, L8-C6, L8-C11).
#
#   apps/lfd-osrm/scripts/build-graph.sh <dossier-de-sortie>
#
# Le dossier de sortie doit être HORS du dépôt : le `.dockerignore` racine ne
# le connaît pas, et c'est lui qui sert de contexte au `docker build` de
# l'image (seuls les `savoie.osrm.*` y sont copiés). La CI passe un dossier de
# `$RUNNER_TEMP`.
#
# Étapes : extrait Geofabrik Rhône-Alpes → découpe au polygone de la Savoie
# (relation OSM 7425) → osrm-extract (profil car) → osrm-partition →
# osrm-customize (MLD) → vérification : `osrm-routed` charge le graphe et
# répond à un /route Val d'Isère → Arc 1800. Sinon, le script échoue — une
# carte qui ne se charge pas ne doit jamais atteindre une image.
#
# Toutes les étapes OSRM tournent dans LA même image que celle qui servira
# (`osrm-version.env`, par digest, amd64).
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage : $0 <dossier-de-sortie hors du dépôt>" >&2
  exit 2
fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../osrm-version.env
source "$HERE/osrm-version.env"

mkdir -p "$1"
OUT="$(cd "$1" && pwd)"
case "$OUT/" in
  "$REPO_ROOT"/*)
    echo "❌ $OUT est dans le dépôt : le graphe doit être préparé HORS du contexte Docker du dépôt." >&2
    exit 2
    ;;
esac

EXTRACT_URL="https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf"
POLYGON_URL="https://polygons.openstreetmap.fr/get_poly.py?id=7425&params=0"
# Val d'Isère (le labo) → Arc 1800 : le trajet de la mesure L8-C6
# (OSRM 46,7 km · 58 min ; réalité 55 min). Longitude,latitude.
PROBE_ROUTE="6.9797,45.4486;6.7713,45.5724"
PLATFORM="linux/amd64"

run_osrm() {
  docker run --rm --platform "$PLATFORM" -v "$OUT:/data" "$OSRM_IMAGE" "$@"
}

echo "▸ Extrait Rhône-Alpes (Geofabrik)"
curl --fail --location --silent --show-error -o "$OUT/rhone-alpes.osm.pbf" "$EXTRACT_URL"
echo "▸ Polygone de la Savoie (relation 7425)"
curl --fail --location --silent --show-error -o "$OUT/savoie.poly" "$POLYGON_URL"
if ! head -n 1 "$OUT/savoie.poly" | grep -q .; then
  echo "❌ Polygone de la Savoie vide : polygons.openstreetmap.fr n'a rien rendu." >&2
  exit 1
fi

echo "▸ Découpe (osmium)"
docker run --rm --platform "$PLATFORM" -v "$OUT:/data" "$OSMIUM_IMAGE" \
  osmium extract --overwrite -p /data/savoie.poly -o /data/savoie.osm.pbf /data/rhone-alpes.osm.pbf

echo "▸ Préparation OSRM $OSRM_VERSION (extract → partition → customize)"
run_osrm osrm-extract -p /opt/car.lua /data/savoie.osm.pbf
run_osrm osrm-partition /data/savoie.osrm
run_osrm osrm-customize /data/savoie.osrm

verify_graph() {
  local name="lfd-osrm-verify-$$"
  local port=5055
  docker run -d --rm --name "$name" --platform "$PLATFORM" -p "127.0.0.1:$port:5000" \
    -v "$OUT:/data" "$OSRM_IMAGE" \
    osrm-routed --algorithm mld --max-table-size 200 /data/savoie.osrm >/dev/null
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' RETURN
  local body=""
  for _ in $(seq 1 60); do
    body="$(curl --silent --max-time 5 "http://127.0.0.1:$port/route/v1/driving/$PROBE_ROUTE?overview=false" || true)"
    [ -n "$body" ] && break
    sleep 1
  done
  if ! printf '%s' "$body" | grep -q '"code":"Ok"'; then
    echo "❌ osrm-routed n'a pas rendu d'itinéraire Val d'Isère → Arc 1800 : $body" >&2
    docker logs "$name" >&2 || true
    return 1
  fi
  echo "✅ Graphe chargé — Val d'Isère → Arc 1800 : $(printf '%s' "$body" | grep -o '"duration":[0-9.]*,"distance":[0-9.]*' | head -n 1)"
}

echo "▸ Vérification du graphe"
verify_graph

rm -f "$OUT/rhone-alpes.osm.pbf"
du -ch "$OUT"/savoie.osrm.* | tail -n 1
