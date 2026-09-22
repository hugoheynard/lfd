# Les outils WebMCP du référentiel — ce qui existe, et ce qui reste

> **État : ✅ bâti et éprouvé dans un navigateur** (tranche 1, 2026-09-10).
>
> 🔴 **Ce document était un PLAN ; il est devenu un état des lieux le
> 2026-09-22.** Un plan se lit pour décider ; celui-ci était encore rangé parmi
> les choses à trancher alors que son travail était livré, et il fallait
> traverser onze sections de justification pour apprendre qu'on pouvait s'en
> servir. Ce qui reste du plan — les raisons qui portent, et ce qu'une
> contradiction a fait tomber — vit désormais en annexe.

---

## 1. S'en servir, en trois phrases

1. Ouvrir **`/outils-agent`** dans le back-office. La route est gardée par
   `permissionGuard('pim_catalog:write')` — l'écriture, pas la lecture, puisque
   ces outils écrivent.
2. L'écran dit s'il y a un agent branché. **Il n'y en a aucun par défaut** :
   aucun navigateur ne fournit `modelContext` aujourd'hui, et l'assistant doit
   poser le pont lui-même dans la page (annexe A.3).
3. Les outils n'existent **que pendant que cette page est ouverte**. En sortir
   les retire.

⚠️ **L'écran EST l'interrupteur**, et c'est la seule protection. Elle est
volontairement visible plutôt que configurée : un écran ouvert se constate, un
drapeau dans `angular.json` ne rougit nulle part — aucune porte du dépôt ne le
lit.

---

## 2. Les huit outils livrés

Ils vivent dans
[`agent/pim-agent-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/pim-agent-tools.ts)
(336 lignes), déclarés par l'écran
[`agent/agent-tools-page/`](../../apps/lfd-backoffice-frontend/src/app/agent/agent-tools-page/).

| Outil                       | Ce qu'il fait                                     |
| --------------------------- | ------------------------------------------------- |
| `pim_categories_list`       | liste les familles — pour choisir un rattachement |
| `pim_products_list`         | liste les fiches                                  |
| `pim_product_read`          | lit une fiche entière                             |
| `pim_product_create`        | crée une fiche, avec sa déclinaison par défaut    |
| `pim_product_set_identity`  | nom, référence, famille, nature                   |
| `pim_product_set_editorial` | récit, provenance, SEO                            |
| `pim_variant_set_nutrition` | valeurs de l'annexe XV, par déclinaison           |
| `pim_product_set_channels`  | où la fiche se vend                               |

**Le nombre n'est pas recopié dans l'écran** : la liste affichée est rendue par
la déclaration elle-même. Une liste écrite à la main survivrait à un outil
supprimé, et l'écran annoncerait une capacité absente.

### Ce qu'ils visent

Tous passent par `ProductHttpApi`, qui injecte `HttpClient` — donc par **la même
porte que l'écran**, validations serveur comprises.

> ⚠️ Une exception, et elle est bénigne : `pim_categories_list` passe par
> `CategoryStore.reload()`. C'est une **lecture**, et le store n'y fabrique aucun
> état. La règle du §A.1 vise les écritures.

---

## 3. Ce qui a été constaté en bâtissant, et qui a changé le code

Éprouvé dans un navigateur contre l'API locale, pont posé à la main :

| Ce qui était supposé                  | Ce qui a été constaté                            |
| ------------------------------------- | ------------------------------------------------ |
| Les outils s'enregistrent à l'arrivée | **huit** noms dans le registre                   |
| `DestroyRef` les retire à la sortie   | **zéro** après avoir quitté l'écran              |
| Une fiche se crée de bout en bout     | famille lue, fiche créée, éditorial écrit, relue |
| Un refus se rend en texte             | « Aucune fiche pour l'identifiant nawak. »       |

**Deux surprises, et elles ont changé le code :**

- 🔴 **Écrire la nutrition efface les allergènes.** Le backend remplace la
  déclaration réglementaire ENTIÈRE ; poser une seule valeur nutritionnelle les
  emporterait. L'outil relit donc la fiche et les réécrit à l'identique — et
  **refuse** quand ils valent `null`, parce qu'écrire alors affirmerait « aucun
  allergène » sur une fiche où personne ne s'est prononcé.
- 🔴 **Un schéma construit par `Object.fromEntries` perd l'inférence.** Le
  paramètre de type est `const` ; les huit clés nutritionnelles dérivées d'une
  liste laissaient `args` sans elles, et la compilation l'a dit (`TS7053`). Les
  propriétés sont donc écrites **en clair**, avec le commentaire qui dit
  pourquoi — sans quoi quelqu'un les factorisera de nouveau.

---

## 4. Ce qui reste à faire

### ✅ Tranche 2 — les allergènes : **débloquée le 2026-09-22**

Le plan la réservait à une mesure jamais faite. Elle est faite, en ouvrant
`pim/catalogue/product/domain/value-objects/nutrition-declaration.ts` :

| Ce qu'un outil enverrait               | Ce que le serveur en fait                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| Le même code **deux fois**             | **dédoublonné en silence**, dans l'ordre d'arrivée               |
| Un code **inconnu**                    | **refusé** — `catalogue.allergen.unknown`                        |
| Un code **présent ET en trace**        | **refusé** — `catalogue.allergen.overlap`                        |
| Un code **archivé**, sur une relecture | **accepté** (D2 bis) — le refus d'AJOUT est une règle du handler |

🔴 **La garde est au bon endroit** : dans le value object, pas dans un DTO HTTP.
Son commentaire dit pourquoi — « un import ou un seed la contournerait ; elle est
ici, sur le chemin unique ». Un outil WebMCP est un appelant de plus sur ce
chemin : il **ne peut pas** la contourner.

⚠️ **Ce que la mesure oblige l'outil à faire** : le dédoublonnement étant
silencieux, un agent qui relit ce qu'il a écrit pour se vérifier constaterait
autre chose que ce qu'il a demandé. **L'outil doit relire et rendre l'état
réel** — exactement comme `pim_variant_set_nutrition` le fait déjà.

### 🔴 L'argent — exclu, et ça demande une décision

Ni `:id/vat`, ni `:id/variants/:v/pricing`. Un plan qui touche à l'argent relève
de `vitruve` d'office (CLAUDE.md §9 bis) ; celui-ci s'y soustrait en n'y touchant
pas. **Le rouvrir est un chantier à part**, pas une tranche de plus.

### 🔵 Le cycle de vie — exclu, et c'est la décision de Hugo

Ni `ready`, ni `publish`, ni `archive`. **Publier est une décision** ; elle reste
au clic.

### Les trous que ce chantier ne comble pas, et qu'il note

- **Aucun e2e navigateur ne couvre la fiche produit**, adossée à un store de
  1898 lignes. Un outil qui appelle l'API ne prouve rien sur ce que l'écran
  affiche — les deux défauts trouvés le 2026-09-10 sur `price-explain` ne se
  voyaient qu'en regardant.
- Le mur staff **n'est pas appliqué route par route** côté serveur. Ces outils
  n'y changent rien : ils empruntent les routes que l'écran emprunte déjà.

---

## Annexe A — les raisons qui portent

### A.1 Viser l'API, jamais le store

La v1 faisait appeler `ProductFormStore` aux outils. `vitruve` a montré qu'un
outil branché sur le store fabrique **des états que l'écran ne peut pas
produire** — ce que le `CLAUDE.md` interdit nommément pour les données de test,
et pour la même raison. Trois exemples relevés dans le code :

- `toggleAllergen` fait `[...current, code]` **sans dédoublonner** ; depuis
  l'écran c'est inatteignable, la case étant déjà cochée ;
- le gabarit masque la liste sous `@if (!store.declaresNone())`, donc un outil
  peut poser `declaresNone: true` **et** une liste non vide — état que deux
  chemins de sauvegarde interprètent différemment, sur une donnée réglementaire ;
- `setName` écrit dans la **langue courante du sélecteur**, un état d'interface
  que l'agent ne voit pas : appelé pendant que l'humain a laissé `en`, il écrit le
  nom anglais, et `isValid()` refuse ensuite **sans message**. L'outil
  rapporterait un succès pour rien.

Viser la route fait passer l'outil par la même porte que l'écran, langue
explicite dans la charge utile. Ça coûte un aller-retour réseau, et c'est
dérisoire.

### A.2 D'où vient l'autorité

Ce qui manquait n'était pas une route — le contrôleur les expose toutes — c'était
une **autorité**. L'assistant ne peut pas fabriquer de jeton staff et ne doit pas
en manipuler.

`staff-auth.interceptor.ts` attache le `Bearer` de `getAccessTokenSilently()` à
chaque requête du front. Un outil déclaré dans l'application en hérite : **aucun
secret ne sort de la page**, aucun jeton ne passe par une ligne de commande, et
chaque écriture est portée par le compte de Hugo — exactement comme un clic.

⚠️ **WebMCP ne change donc pas l'autorité, il change le coût et la fiabilité.**
Un agent capable de piloter le navigateur peut déjà cliquer, avec les mêmes
droits. La v1 affirmait le contraire et en tirait tout un dispositif de
confinement : c'était surdimensionné.

### A.3 Le pont, et pourquoi l'application n'en embarque aucune ligne

Angular abandonne en silence sans API navigateur, et lit **`document.modelContext`
d'abord** — que l'assistant peut poser lui-même après chargement.

🔴 **Conséquence non négociable** : les fournisseurs de la racine s'exécutent au
démarrage, avant que le pont existe. Un outil déclaré dans `app.config.ts` ne
s'enregistrerait **jamais**. Tous se déclarent depuis un composant de route.

Deux règles que le pont doit tenir :

- **Il cède la place.** Si `navigator.modelContext` existe déjà, le pont ne
  s'installe pas — sinon, le jour où Chrome livre l'API, notre faux `document`
  masquerait le vrai agent.
- **Il vérifie son installation.** Si `document.modelContext` devient un
  accesseur en lecture seule, l'affectation échoue en silence.

### A.4 Le contrat d'un outil

- **Retour : une `string`.** Angular n'enveloppe rien. ⚠️ La v1 imposait
  `{content:[{type:'text',…}]}` en le présentant comme le contrat WebMCP :
  c'était recopié d'un exemple en ligne, pas lu dans les types installés.
- **Un outil par appel.** La signature ne porte **qu'un** paramètre de type ;
  un tableau hétérogène unifierait les schémas et pousserait au cast — l'infraction,
  dans un dépôt à zéro `as unknown as`.
- **Un refus se rend en texte**, jamais en exception. Un outil qui casse la
  boucle de l'agent est pire qu'un outil qui dit non.
- **Aucune lecture du DOM.** Un outil appelle et rend.

---

## Annexe B — ce que la contradiction a fait tomber (v1, 2026-09-10)

| Objection                                                                     | Effet                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `fileReplacements` est la seule couche, et aucune porte ne lit `angular.json` | la v1 tombe : l'écran devient l'interrupteur           |
| Le pont n'était **pas** mécanisé                                              | dissous : plus aucun code de pont livré                |
| `saveDirty()` écrit **le prix** sans que la v1 le dise                        | dissous : l'argent est exclu explicitement             |
| `saveDirty()` est un **no-op en création**, le cas d'usage même               | dissous : la création passe par `POST /products`       |
| Les setters écrivent dans une **langue implicite**                            | dissous : la langue est explicite dans la charge utile |
| Le doublé **masquerait** la vraie API le jour où Chrome l'expose              | retenu : le pont cède la place                         |
| La forme de retour était **inventée**                                         | corrigé : une `string`                                 |
| Un seul paramètre de type pour un tableau d'outils                            | corrigé : une déclaration par outil                    |
