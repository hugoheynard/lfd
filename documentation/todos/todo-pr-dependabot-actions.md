# La mise à jour des actions GitHub proposée par Dependabot

> 📋 Noté le 2026-11-26. Personne ne l'a prise.

## En bref

Dependabot a ouvert une PR le 2026-11-21 (la n° 2, branche
`dependabot/github_actions/actions-fa14fffbc9`). Elle monte deux actions
utilisées par `.github/workflows/ci.yml` :

| Action                    | Aujourd'hui | Proposé |
| ------------------------- | ----------- | ------- |
| `actions/upload-artifact` | 4.6.2       | 7.0.2   |
| `actions/setup-java`      | 5.7.0       | 6.3.0   |

Hugo a décidé de la laisser ouverte et de la regarder plus tard. Sa branche
est la seule à avoir été gardée sur origin lors du nettoyage du 2026-11-26.

## Ce qu'il faut vérifier avant de la fusionner

- **Deux versions majeures sautées** pour `upload-artifact` (4 → 7). Il faut
  lire les notes de version des versions 5, 6 et 7 : les noms d'artefact, leur
  écrasement et la rétention ont déjà changé d'une version majeure à l'autre.
- **`setup-java` change de version majeure.** Il faut repérer quel job s'en
  sert et vérifier ce que la version 6 change.
- **La PR passe par `lint:workflows`** (actionlint épinglé). La porte doit
  rester verte.
- **La branche est partie de dev le 2026-11-21.** Il faut la rebaser avant de
  la fusionner : `ci.yml` a bougé depuis.
- **Un workflow n'est lu que par GitHub.** Il faut le faire tourner sur dev
  et regarder la CI avant toute promotion vers main.

## Issue

Fusionner après ces vérifications, ou fermer la PR. La fermer supprime la
branche Dependabot, qui la reproposera au prochain passage.
