#!/usr/bin/env bash
#
# Démarre la pile de développement, et **la nettoie en partant**.
#
# ## Le défaut qu'il ferme
#
# Les scripts `dev:*` lançaient leurs deux compagnons ainsi :
#
#     (node dev-toolbox/restart-api-on-package-build.mjs &) && turbo run dev …
#
# Le sous-shell rend la main aussitôt, le processus est réattaché à `PID 1`, et
# **plus rien ne l'arrête** : un `Ctrl-C` tue turbo et laisse le compagnon
# vivant. Chaque démarrage en ajoutait un.
#
# Ce n'est pas une hypothèse. Le 2026-09-10, cette machine en portait **sept**,
# le plus ancien remontant au 6 septembre — plus cinq `nest start --watch`
# orphelins, dont un de huit jours. Aucun ne coûtait beaucoup de mémoire ; tous
# tenaient un observateur de fichiers sur le dépôt entier, et le poste avait
# fini par ramer.
#
# ## Ce que ce script change, et ce qu'il ne change pas
#
# Les compagnons deviennent des **enfants** de ce shell, et un `trap` les tue à
# la sortie — quelle qu'elle soit : fin normale, `Ctrl-C`, `kill`. Le reste est
# identique, turbo compris : ce n'est pas une refonte de la boucle de travail,
# c'est la fermeture d'une fuite.
#
# Un **balayage** au démarrage retire en plus les compagnons qu'une session
# précédente aurait laissés. Le dépôt pratique déjà ce geste — `pnpm free-port`
# tue ce qui squatte le 3200 avant de démarrer l'API — et il est sûr ici pour la
# même raison : deux piles de dev ne coexistent pas, elles se disputeraient les
# mêmes ports.
#
# Usage : bash dev-toolbox/dev-stack.sh --filter=… --filter=…
#   SUITE_URL  l'adresse que la bannière « prête » annonce (défaut : back-office)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPANION="dev-toolbox/restart-api-on-package-build.mjs"

# Les PID des compagnons de CETTE session. Vide tant que rien n'est lancé —
# d'où le `${…:-}` du nettoyage, sans quoi `set -u` ferait échouer le trap
# lui-même sur une sortie précoce (l'infra qui ne monte pas, par exemple).
helpers=()

cleanup() {
  # Se désarmer d'abord : un `kill` qui échoue ne doit pas rappeler le trap.
  trap - EXIT INT TERM
  local pid
  for pid in "${helpers[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT
# 130 et 143 sont les codes qu'un shell rend pour SIGINT et SIGTERM. Les poser
# explicitement garde `dev:apps` honnête vis-à-vis de ce qui l'appelle — un
# `Ctrl-C` ne doit pas se lire comme une réussite.
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# ─── Le balayage des sessions précédentes ────────────────────────────────────
#
# Ciblé par le CHEMIN du script, et restreint à ce dépôt : `pgrep -f` sur un
# nom court attraperait un homonyme chez quelqu'un d'autre. `|| true` partout —
# n'avoir rien à balayer est le cas normal, pas une erreur.
leaked="$(pgrep -f "$COMPANION" 2>/dev/null || true)"
if [ -n "$leaked" ]; then
  echo "› $(echo "$leaked" | wc -l | tr -d ' ') compagnon(s) d'une session précédente retiré(s)"
  echo "$leaked" | xargs -r kill 2>/dev/null || true
fi

# ─── La préparation, inchangée ───────────────────────────────────────────────
cd "$ROOT"
node dev-toolbox/fresh-vite-deps.mjs
pnpm dev:infra
pnpm db:dev:sync

# ─── Les compagnons, cette fois adoptés ──────────────────────────────────────
#
# `suite-ready` sort de lui-même (bannière, ou garde de 120 s) : il n'a jamais
# fuité. Il est suivi quand même — c'est le suivi qui doit être la règle, pas
# l'exception accordée à celui dont on a constaté le défaut.
node dev-toolbox/suite-ready.mjs &
helpers+=("$!")

node "$COMPANION" &
helpers+=("$!")

# ─── Et turbo, au premier plan ───────────────────────────────────────────────
#
# Au premier plan et non en tâche de fond : c'est lui la session. Quand il rend
# la main, le `trap EXIT` ramasse les compagnons.
turbo run dev dev:watch dev:typecheck \
  --output-logs=new-only \
  --concurrency=20 \
  "$@"
