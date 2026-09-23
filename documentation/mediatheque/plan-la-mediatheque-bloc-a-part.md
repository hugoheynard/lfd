# La médiathèque devient un bloc — le plan, et ce qu'il a coûté

> **Plan EXÉCUTÉ le 2026-09-23.** Les trois déploiements sont faits : la
> médiathèque est un bloc, avec son schéma, ses deux canaux et sa surface de
> base. Ce document n'est plus une consigne : c'est le compte rendu.
>
> ➡️ L'état du système : [`la-mediatheque.md`](la-mediatheque.md).
> Ce qui reste : [`../todos/todo-mediatheque.md`](../todos/todo-mediatheque.md).
>
> 🔴 **Ce fichier ne se renomme pas.** Trois migrations appliquées le citent
> (`…140000_media_url_sur_les_rattachements`, `…150000_une_image_une_ligne`,
> `…170000_la_mediatheque_a_son_schema`), et une migration ne se retouche pas.

---

## Le plan a été contredit AVANT d'être écrit en code

`vitruve` a rendu **six BLOQUANT** sur la première version, et trois portaient
sur des phrases écrites sans ouvrir le fichier — alors que l'en-tête
prétendait le contraire. Sa remarque la plus utile n'était pas une objection :

> « Cette phrase est plus coûteuse que son absence. »

| Ce que le plan affirmait                           | Ce qui était vrai                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| « quatre fichiers touchent la bibliothèque »       | huit — les lecteurs par `include: { media: true }` sont invisibles à un grep sur le modèle |
| « la plus récente alternative **non vide** »       | `alt` n'est **jamais** vide : sans saisie, c'est l'URL                                     |
| « le panneau ne saisit l'alternative qu'au dépôt » | il est dans l'éditeur de fiche, indexé par emploi                                          |
| « la porte de propriété interdit au PIM d'écrire » | son `BLOCKS` est en dur : un bloc `media/` y serait **ignoré**                             |
| « les deux adaptateurs déménagent tels quels »     | le balayeur repose sur des relations que ③ supprime                                        |
| « le plan paie la règle de suppression »           | il la **nommait** ; le balayeur a sa propre voie                                           |

**La racine est unique** : compter en partant du code qu'on connaît plutôt que
de la ressource. Un `include: { media: true }` ne contient pas le nom du
modèle.

---

## Ce que l'exécution a retourné, à son tour

### L'ordre était inverse de celui qu'on croyait

Impossible de déménager le code d'abord :
`lint:prisma-model-ownership` dérive la propriété de **qui écrit**, et
`replaceMedia` créait des actifs. Ce n'était donc pas « déménager puis
nettoyer » mais **« faire cesser le PIM d'écrire, ce qui libère le
déménagement »**.

La séquence réelle, chacune commandant la suivante :

1. une image, une ligne (index UNIQUE sur l'URL) ;
2. plus de visuel par simple URL ;
3. les lectures par l'URL, plus par la relation ;
4. l'étiquette et l'alternative hors de la fiche ;
5. le port `ImageCatalogue` ;
6. le bloc, ses deux canaux, et les portes armées ;
7. le schéma.

### Postgres a refusé un raccourci, et il a bien fait

Rendre `media_id` facultatif « tout de suite » a échoué en `42P16` : on ne
rend pas nullable une colonne de clé primaire. Ce refus a évité de franchir le
③ **sans le décider** — c'est lui qui emporte le `ON DELETE RESTRICT`.

### Une recopie évitée

Le plan prévoyait de recopier la table vers un nouveau schéma.
`ALTER TABLE … SET SCHEMA` est **instantané** : Postgres ne déplace que l'entrée
de catalogue. Une recopie aurait été longue, et son échec partiel aurait laissé
deux vérités.

### Armer une porte, c'est l'entendre mordre

Ajouter `media` au `BLOCKS` de la porte de propriété l'a aussitôt fait refuser
que la bibliothèque lise `product_media` — d'où le **second canal**,
`MediaCarriers`. Sans cette ligne, le déménagement aurait **désarmé** la porte
au lieu de l'invoquer.

Même chose pour `lint:journal-tracked` : son périmètre s'arrêtait à
`src/pim/**`, et elle ne reconnaissait pas `MediaLibraryWriter` comme un dépôt.
Sortir du dossier aurait fait perdre en silence le journal qu'on venait de
donner à la médiathèque.

---

## Les trois comptages de production

Faits le 2026-09-23, avant d'écrire la moindre migration de fusion.

| Comptage                                | Résultat | Ce qu'il a retiré du plan                                 |
| --------------------------------------- | -------- | --------------------------------------------------------- |
| URL à alternatives humaines divergentes | **0**    | la fusion ne choisit rien, ne perd aucun écrit            |
| même URL deux fois sur un produit       | **0**    | la migration ne plante pas                                |
| emplois dont l'alternative changerait   | **0**    | aucune empreinte de révision ne bouge, aucun diff ne part |

🔴 Le second zéro ne se lit **pas** comme « le cas n'existe pas » : il était à
zéro parce qu'aucun écran ne permettait de désigner un rôle autre que `hero`
avant la veille. D'où la clé primaire `(porteur, url, rôle)` — décidée, pas
constatée.

---

## Ce que le déploiement a coûté

- **La règle de suppression change de gardien.** Les clés étrangères étaient en
  `ON DELETE RESTRICT` ; elles n'existent plus. Les deux gardiens de code —
  refus compté, balayeur qui s'abstient — ont été écrits **avant** la
  migration.
- **`POST /pim/catalogue/media` disparaît sans alias.** Il n'était pas
  transposable hors du préfixe du référentiel : le back-office et l'API doivent
  se déployer ensemble.
- **Le panneau de la fiche perd l'alternative**, et personne ne l'avait prévu
  en décidant « un seul point ». Qui rédige une fiche va décrire l'image
  ailleurs.
