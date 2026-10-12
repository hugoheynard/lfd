# TODO — fold ne protège pas ses champs du zoom iOS

**Ouvert le 2026-10-12**, à la demande de Hugo (« très important que sur un
appareil mobile on ait pas d'effet de zoom en cliquant sur un champ »).

## Le fait

Safari iOS agrandit la page dès qu'un champ qui prend le focus a un texte de
moins de **16 px**, et la laisse agrandie après la saisie. Les champs fold
(`fold-input`, `fold-search`, `fold-textarea`, `fold-listbox`…) prennent la
taille de l'échelle du thème, qui plafonne sous 16 px : **tous** déclenchent le
zoom.

## Ce que les apps font en attendant

Chaque app porte la même règle dans son `styles.scss`, sous
`@media (pointer: coarse)` — au doigt seulement, la souris garde l'échelle :

- `apps/lfd-backoffice-frontend/src/styles.scss` — `font-size: 16px !important` ;
- `apps/lfc-ecommerce-frontend/src/styles.scss` — `font-size: max(16px, 1em) !important`.

Le `!important` est forcé : les styles de composant fold sont scopés
(`input[_ngcontent-…]`), une règle globale perd toujours la spécificité. Jusqu'au
2026-10-12, la règle de la boutique n'en avait pas, et ne s'appliquait à
aucun champ fold — sans que rien le signale.

## Ce que fold devrait faire

Poser lui-même ce plancher dans ses champs, au doigt (`pointer: coarse`), sans
réglage de l'app : un champ qui fait zoomer est un défaut du système de design.
Les deux règles applicatives se retirent alors, dans le même commit que la
montée de version de fold.

Ce qu'on **ne** fait pas : `maximum-scale=1` / `user-scalable=no` dans la
balise viewport. Ça empêche aussi le zoom volontaire au pincement, dont ont
besoin les personnes malvoyantes.
