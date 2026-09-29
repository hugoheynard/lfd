# Image de `lfd-osrm` : le calcul d'itinéraires routiers de la Savoie
# (plan de tournée, lot 8, forme B-ter — L8-C10/C11).
#
# L'IMAGE EST LA CARTE : le graphe `.osrm*` est copié dedans, préparé dans la
# même exécution par `scripts/build-graph.sh`. Le tag de l'image porte la date
# de l'extrait et la version d'OSRM ; revenir à la carte précédente, c'est
# redéployer le tag précédent (documentation/ops/runbook.md).
#
# Construction — le CONTEXTE est le dossier du graphe, jamais le dépôt :
#
#   source apps/lfd-osrm/osrm-version.env
#   docker build --platform linux/amd64 \
#     --build-arg OSRM_IMAGE="$OSRM_IMAGE" \
#     -f apps/lfd-osrm/Dockerfile <dossier-du-graphe>
#
# `OSRM_IMAGE` n'a volontairement AUCUN défaut : sa seule source est
# `osrm-version.env`, partagée avec la préparation du graphe. Un défaut ici
# serait une seconde copie de la version, qui dériverait de la première.
ARG OSRM_IMAGE
FROM --platform=linux/amd64 ${OSRM_IMAGE}

WORKDIR /data
# Le graphe MLD (profil car) : `savoie.osrm.*`. Aucun autre fichier du
# contexte n'est lu.
COPY savoie.osrm.* /data/

EXPOSE 5000
# `--max-table-size 200` : le `/table` refuse au-delà de 200 points (100 par
# défaut). Une tournée en compte quelques dizaines ; le client (lfd-api) doit
# refuser nommément avant d'atteindre cette borne (L8-C2).
CMD ["osrm-routed", "--algorithm", "mld", "--max-table-size", "200", "--port", "5000", "/data/savoie.osrm"]
