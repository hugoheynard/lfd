# TODO — des ressources en lecture seule dans le modèle des droits

**Ouvert le 2026-10-06** (Hugo, chantier de l'arrêt du plan :
[`production/plan-arret-du-plan.md`](../production/plan-arret-du-plan.md) §6).

## L'incohérence, assumée en attendant

Depuis le lot A1, l'arrêt du plan est gardé par `production_count_stop:write`.
`production_plan:write` ne garde plus **aucune route** (vérifié le
2026-10-06 : la seule écriture sous la surface `production_plan` était
`POST admin/production/batch/:date/close`). Il reste pourtant proposé dans
l'écran des rôles, décrit « N'ajoute rien », parce que le modèle donne à
**toute** ressource les deux gestes : `StaffAction = read | write`.

Conséquences tant que ce n'est pas réglé :

- un rôle peut porter `production_plan:write` sans que cela lui donne rien ;
  le cocher ne fait pas « arrêter le plan » ;
- les rôles qui l'avaient le gardent en base ; c'est une donnée morte, pas
  un droit.

Décidé par Hugo le 2026-10-06 (option 1) : le laisser ainsi, décrit comme
vide, plutôt que lui donner un autre geste (cocher au fournil existe déjà :
`production_worksheet:write`).

## Ce qu'il faudrait

Que le catalogue des ressources déclare les gestes qu'une ressource admet
(`read` seul, ou `read` + `write`), que l'écran des rôles ne propose que
ceux-là, et qu'une porte refuse un `@RequirePermission` sur un geste non
déclaré. `production_plan` deviendrait alors une ressource en lecture seule.

À voir : ce qu'on fait des `write` déjà posés en base sur une ressource
devenue lecture seule (ignorés à la résolution, ou nettoyés sur ordre).
