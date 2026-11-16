# Ce que la répétition du 2026-11-15 a relevé

> Relevé le 2026-11-15 en déroulant une journée de production complète sur la
> pile de dev (code identique à la production `8fae69f58`, plus les correctifs
> de l'outil de démo) : arrêt du plan, dossier du jour, fournées, annulation
> d'une fournée remise, mise en sac, étiquette, supervision, tournées et feuille
> de route, départ, retrait au comptoir. Rien n'est corrigé ici : chaque point
> dit ce qui a été vu, où il vit, et ce qui reste à vérifier. Le service à
> blanc est prévu le 2026-11-23.

## 1. En simple

La chaîne tourne de bout en bout. Trois défauts d'écran sèmeraient le doute le
jour J sans bloquer le service ; deux limites de l'outil de démo gênent les
répétitions ; la base locale tombe parfois un instant.

| #   | Où              | Ce qu'on voit                                                     | Gravité                                   |
| --- | --------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| 1   | Colisage        | « 350 en stock » avant qu'une seule pièce soit cuite              | ✅ corrigé : « à répartir »               |
| 2   | Supervision     | la colonne Retrait / livraison écrase son texte, un mot par ligne | ✅ corrigé : l'action passe dessous       |
| 3   | Tour manager    | la carte dit 17 arrêts, la feuille de route en PDF 18             | ✅ corrigé : la carte compte le transfert |
| 4   | Jeu de données  | une étape qui échoue en cours de route ne se rejoue pas           | outil de démo seulement                   |
| 5   | Jeu de données  | un reset en échec laisse l'écran sur « En cours… »                | outil de démo seulement                   |
| 6   | Postgres de dev | « base injoignable » un instant, trois fois dans la journée       | poste de dev seulement                    |

Non éprouvé, faute d'appareil : le dépôt d'une livraison avec photo (téléphone
du coursier), les impressions sur les vraies imprimantes, le glisser-déposer
du colisage au doigt sur tablette, plusieurs postes ouverts au rush.

## 2. Le détail

### 1. Colisage — « N en stock »

- Écran : `apps/lfd-backoffice-frontend/src/app/production/colisage/packing-container-board/packing-container-board.html:43-51`
  écrit `{{ remaining }} en stock` sous chaque ligne, lu dans
  `colisage.ts` (`stockBySku`, la ressource du serveur).
- Contrat : `packages/contracts/src/production-packing.ts`, `PackingResource`.
  Son JSDoc dit « ce que le four a sorti », mais le champ `produced` dit « ce
  que le compte à produire de la journée porte » ; `remaining = produced − allocated`
  (`apps/lfd-api/src/packing/domain/services/packing-board.ts:211`).
- Vu : baguette tradition « 350 en stock » alors qu'aucune fournée n'était
  déclarée. Le chiffre est le plan moins ce qui est en bac, pas un stock.
- ✅ Corrigé le 2026-11-16 : l'écran dit « N à répartir », et le JSDoc du
  contrat dit que le compte vaut dès l'arrêt du plan.

### 2. Supervision — colonne « Retrait / livraison »

- Écran : `apps/lfd-backoffice-frontend/src/app/supervision/handover-column/`.
- Vu à 1288 px de large : les cartes de retrait affichent « Pas / prête / , /
  créneau / dépassé / par / nous… », un mot par ligne ; la colonne est trop
  étroite pour son contenu.
- ✅ Corrigé le 2026-11-16 : la ligne passe à la ligne, et le bouton de
  rappel ou le renvoi tombe sous le client au lieu de l'écraser (`.who` garde
  14rem). Reste à voir sur la vraie tablette de supervision.

### 3. Tour manager — 17 ou 18 arrêts

- Vu : la carte « Camionnette 2 » annonce 17 arrêts ; sa feuille de route
  (`GET /admin/delivery/rounds/:id/round.pdf`,
  `apps/lfd-api/src/delivery/application/queries/get-round-paper-pdf.handler.ts`)
  annonce 18. ✅ Corrigé le 2026-11-16 : la carte ne comptait pas l'arrêt de
  transfert au Village (`round-column`, `mapSubtitleOf`) ; elle le compte,
  comme la feuille de route.
- La même tournée porte « Dépasse la durée max » (5 h 21 → 11 h 18, 17 arrêts) :
  à relire avec le réglage de durée maximale avant le 23.

### 4 et 5. L'outil de démo

Décrits dans
[`commandes/architecture-jeu-de-donnees-par-etapes.md`](../commandes/architecture-jeu-de-donnees-par-etapes.md),
§ 4 (reste à faire).

### 6. Postgres de dev

- Vu : `persistence.database_unavailable` (503) trois fois — deux pendant des
  suites e2e, une pendant le reset du scénario ; chaque fois passager, le
  geste relancé passe. Le conteneur `lfd-dev-postgres` tenait alors 3,5 Go.
- À regarder : la mémoire et le disque du conteneur, et si les e2e et la pile
  de dev se disputent la même instance.
