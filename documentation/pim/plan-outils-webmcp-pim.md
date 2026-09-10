# Plan — remplir le PIM par des outils WebMCP plutôt qu'au clic

> **État : la tranche 1 est BÂTIE et éprouvée dans un navigateur** (2026-09-10).
> Ce qui a été constaté en la bâtissant est au §11 ; il répond au §9, qui posait
> les questions ouvertes.
> **Contredit par `vitruve` le 2026-09-10** (v1). Ses objections ont fait tomber
> la v1 entière ; ce document est la v2, et le §10 dit ce qui est tombé.

## 1. Le besoin

Le catalogue PIM de **production** a été rempli au clic, par l'assistant, sur la
session de Hugo. Ça a fonctionné, et ça a coûté un temps déraisonnable : un
aller-retour par champ, avec lecture d'arbre d'accessibilité, mesure de
coordonnées, clic, relecture pour vérifier.

Le travail se fait donc **en production**. Tout plan qui réserve ses outils au
développement ne répond pas à la question posée.

## 2. Le fait qui réoriente tout : le clic n'était pas nécessaire

`pim/catalogue/product/http/product.controller.ts` expose déjà (vérifié le
2026-09-10) :

```
POST /pim/catalogue/products          PUT :id/identity      PUT :id/editorial
PUT  :id/media                        PUT :id/channels      PUT :id/vat
POST :id/variants                     PUT :id/variants/:v/nutrition
PUT  :id/variants/:v/pricing          PUT :id/ready         PUT :id/publish
```

Ce qui manquait n'était pas une route : c'était une **autorité**. L'assistant ne
peut pas fabriquer de jeton staff et ne doit pas en manipuler ; la seule autorité
disponible était la session ouverte dans le navigateur. D'où le clic.

Or `staff-auth.interceptor.ts:35` attache le `Bearer` obtenu par
`getAccessTokenSilently()` à chaque requête du front. **Un outil déclaré dans
l'application injecte `HttpClient` et hérite de cette authentification** : aucun
secret ne sort de la page, aucun jeton ne passe par une ligne de commande, et
chaque écriture est portée par le compte de Hugo — exactement comme un clic.

## 3. Viser l'API, jamais le store

La v1 faisait appeler `ProductFormStore` aux outils. **Abandonné**, et c'est la
correction la plus importante du document.

`vitruve` a montré qu'un outil branché sur le store fabrique des états que
l'écran ne peut pas produire — ce que le `CLAUDE.md` interdit nommément pour les
données de test, et pour la même raison. Trois exemples relevés dans le code :

- `toggleAllergen` (`product-form-store.ts:1039`) fait `[...current, code]` **sans
  dédoublonner** ; depuis l'écran c'est inatteignable, la case étant déjà cochée ;
- le gabarit masque la liste sous `@if (!store.declaresNone())`, donc un outil
  peut poser `declaresNone: true` **et** une liste non vide — état que deux
  chemins de sauvegarde interprètent différemment, sur une donnée réglementaire ;
- `setName` écrit dans la langue courante du sélecteur, un état d'interface que
  l'agent ne voit pas : appelé pendant que l'humain a laissé `en`, il écrit le nom
  anglais, et `isValid()` — qui ne lit que la langue source — refuse ensuite **sans
  message**. L'outil rapporterait un succès pour rien.

Viser `PUT :id/identity` fait passer l'outil par **la même porte que l'écran**,
validations serveur comprises, langue explicite dans la charge utile. Ça coûte un
aller-retour réseau. C'est le prix du chemin honnête, et il est dérisoire.

Effet de bord heureux : les outils ne dépendent plus que de `HttpClient`, fourni
à la racine. La contrainte d'injection de la v1 disparaît.

## 4. Le pont — et l'application n'en embarque aucune ligne

Angular abandonne en silence sans API navigateur (`node_modules/@angular/core/fesm2022/core.mjs`, ligne 3355) :

```js
if (typeof ngServerMode !== "undefined" && ngServerMode) return;
const modelContext = globalThis.document.modelContext ?? globalThis.navigator.modelContext;
if (!modelContext || typeof modelContext.registerTool !== "function") return;
```

`navigator.modelContext` est `undefined` dans le navigateur de l'assistant
(Chromium 152, constaté le 2026-09-10 — non recoupé ailleurs). Mais Angular lit
**`document.modelContext` d'abord**, et l'assistant peut le poser lui-même dans
la page, après chargement, sans que rien ne soit livré pour lui.

🔴 **Conséquence non négociable :** les fournisseurs de la racine s'exécutent au
démarrage, avant que le pont existe. Un outil déclaré dans `app.config.ts` ne
s'enregistrerait **jamais**. Tous les outils se déclarent depuis un composant de
route, par `declareExperimentalWebMcpTool`.

Deux règles que le pont doit tenir, et qui viennent de la contradiction :

- **Il cède la place.** Si `navigator.modelContext` existe déjà, le pont ne
  s'installe pas — sinon, le jour où Chrome livre l'API, notre faux `document`
  **gagnerait** la priorité et masquerait le vrai agent.
- **Il vérifie son installation.** Si `document.modelContext` devient un
  accesseur en lecture seule, l'affectation échoue en silence. Le pont relit ce
  qu'il vient de poser, ou il le dit.

## 5. L'écran est l'interrupteur

Une route dédiée, dont le composant déclare la trousse.

| Propriété                                                | Ce qu'elle donne                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| Les outils n'existent que pendant que l'écran est ouvert | `DestroyRef` les retire à la sortie                                   |
| L'écran est **visible** et nomme ce qu'il arme           | l'état armé est un fait observable, pas une configuration à relire    |
| Aucun drapeau, aucun `fileReplacements`                  | rien à tenir dans `angular.json`, que **aucune des 33 portes ne lit** |

Ce dernier point est la leçon centrale de la contradiction : la v1 fondait sa
sécurité sur une ligne d'`angular.json` que rien ne vérifie, en croyant copier le
patron de `dev-tools.ts`. Elle n'en copiait pas le mécanisme décisif — le seed a
**deux** verrous, dont un côté serveur qui refuse toute base non locale, et c'est
celui-là qui rend le geste inexprimable. Ici il n'y a pas de second verrou
possible : les routes visées sont les routes ordinaires de production.

⚠️ La v1 affirmait qu'il fallait tenir ces outils hors du bundle parce qu'ils
donneraient un pouvoir nouveau à un agent tiers. **C'était surdimensionné** : un
agent capable de piloter le navigateur peut déjà cliquer, avec les mêmes droits.
WebMCP ne change pas l'autorité, il change le coût et la fiabilité.

## 6. La première tranche

| Outil                       | Route visée                       |
| --------------------------- | --------------------------------- |
| `pim_products_list`         | `GET /pim/catalogue/products`     |
| `pim_product_read`          | `GET /pim/catalogue/products/:id` |
| `pim_product_create`        | `POST /pim/catalogue/products`    |
| `pim_product_set_identity`  | `PUT :id/identity`                |
| `pim_product_set_editorial` | `PUT :id/editorial`               |
| `pim_variant_set_nutrition` | `PUT :id/variants/:v/nutrition`   |
| `pim_product_set_channels`  | `PUT :id/channels`                |

**Trois exclusions, chacune pour sa raison :**

- 🔴 **L'argent.** Ni `:id/vat`, ni `:id/variants/:v/pricing`. La v1 donnait
  l'écriture du prix sans le dire — `saveDirty()` passe par `savePricing()`. Un
  plan qui touche à l'argent relève de `vitruve` d'office (§9 bis) ; celui-ci s'y
  soustrait en n'y touchant pas.
- **Le cycle de vie.** Ni `ready`, ni `publish`, ni `archive`. Publier est une
  décision ; elle reste au clic, et elle reste à Hugo.
- **Les allergènes.** Tant qu'on n'a pas constaté si le serveur dédoublonne et
  refuse l'état contradictoire décrit au §3. Une donnée réglementaire ne s'écrit
  pas sur une supposition.

## 7. Contrat de chaque outil

- **Retour : une `string`.** `Execute` rend `unknown` et la JSDoc d'Angular dit
  « typically just a raw `string` » (`node_modules/@angular/core/types/core.d.ts`, ligne 9601) ; Angular n'enveloppe
  rien. ⚠️ La v1 imposait `{content: [{type:'text', text}]}` en le présentant
  comme le contrat WebMCP : c'était recopié d'un exemple de la documentation en
  ligne, pas lu dans les types installés.
- **Un outil par appel de `declareExperimentalWebMcpTool`.** La signature ne porte
  **qu'un** paramètre de type ; passer un tableau hétérogène à
  `provideExperimentalWebMcpTools` unifierait les schémas et pousserait au cast —
  c'est-à-dire à l'infraction, dans un dépôt à zéro `as unknown as`.
- **Refus** : un 4xx se rend comme du texte lisible, jamais comme une exception
  jetée. Un outil qui casse la boucle de l'agent est pire qu'un outil qui dit non.
- **`inputSchema`** avec `required` et `additionalProperties: false` — et c'est au
  **pont** de le faire respecter, sinon la garantie n'existe qu'en théorie et un
  champ mal orthographié est ignoré en silence.
- **Aucune lecture du DOM.** Un outil appelle et rend ; il ne regarde pas l'écran.

## 8. Ce que ce plan ne fait pas

- Il n'ouvre aucune route serveur et ne change aucune permission. Le mur reste
  celui du serveur — dont le `CLAUDE.md` du front rappelle qu'il **n'est pas
  encore appliqué route par route**. Ces outils n'y changent rien, ni en bien ni
  en mal : ils empruntent les routes que l'écran emprunte déjà.
- Il **ne remplace ni les e2e ni la relecture d'écran**. Un outil qui appelle
  l'API ne prouve rien sur ce que l'écran affiche. Les deux défauts trouvés le
  2026-09-10 sur `price-explain` — badge collé au nom du produit, prix barré
  identique au prix final — ne se voyaient qu'en regardant.
- Il n'ajoute pas de couverture : `e2e/` ne contient que `alert-rules.spec.ts` et
  `comptes-clients.spec.ts`. **Aucun e2e navigateur ne couvre la fiche produit**,
  adossée à un store de 1898 lignes. Ce plan ne corrige pas ce trou ; il le note.

## 9. À constater en bâtissant

- L'ordre réel d'enregistrement dans le composant de route — **par un appel
  effectif**, pas par lecture du code.
- Le second argument d'`execute` : Angular fait `{...client, signal}` ; le pont
  passe un objet, jamais `undefined`.
- Le comportement du serveur PIM sur un tableau d'allergènes en doublon (cf. §6).
- Rien à vérifier côté `ngServerMode` : `src/` ne porte aucun point d'entrée serveur — ni le
  `main.server`, ni le `app.config.server`, ni le `server` qu'un projet SSR
  d'Angular pose — et `angular.json` n'a aucune clé `ssr` hors `cloudflare`. L'application est rendue côté client dans **toutes** les
  configurations. La v1 laissait la question ouverte alors qu'un `ls` y répond.

## 10. Ce que la contradiction a fait tomber

| Objection                                                                             | Effet                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `fileReplacements` est la **seule** couche, et aucune porte ne lit `angular.json`     | la v1 tombe : plus de dev-only, l'écran devient l'interrupteur               |
| Le pont en `main.ts` et le site racine en `app.config.ts` n'étaient **pas** mécanisés | dissous : plus aucun code de pont livré, plus aucune déclaration à la racine |
| `saveDirty()` écrit **le prix** sans que la v1 le dise                                | dissous par le §3, et l'argent est exclu explicitement au §6                 |
| `saveDirty()` est un **no-op en création**, le cas d'usage même du plan               | dissous : la création passe par `POST /products`                             |
| Les setters écrivent dans une **langue implicite**                                    | dissous : la langue est explicite dans la charge utile                       |
| Le doublé **masquerait** la vraie API le jour où Chrome l'expose                      | retenu : le pont cède la place (§4)                                          |
| La forme de retour était **inventée**                                                 | corrigé : une `string` (§7)                                                  |
| Un seul paramètre de type pour un tableau d'outils                                    | corrigé : une déclaration par outil (§7)                                     |
| `pending-changes.guard.ts` **ne garde rien** (`canLeave()` rend `true`)               | correction à une affirmation faite en discussion, pas au plan                |

## 11. Ce que le bâti a constaté

La tranche vit dans `apps/lfc-B2B-admin-frontend/src/app/agent/` :
`pim-agent-tools.ts` déclare les outils, `agent-tools-page/` est l'écran, et
`app.routes.ts` porte la route `outils-agent` sous `permissionGuard('pim_catalog:write')`
— l'écriture, pas la lecture, puisque ces outils écrivent.

**Éprouvé dans le navigateur**, contre l'API locale, en posant le pont à la main
puis en naviguant côté client :

| Ce qui était supposé                                  | Ce qui a été constaté                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| Les outils s'enregistrent quand on arrive sur l'écran | **huit** noms dans le registre, après navigation côté client          |
| `DestroyRef` les retire à la sortie                   | **zéro** après avoir quitté l'écran — l'écran est bien l'interrupteur |
| Le pont doit relire ce qu'il a posé                   | l'affectation prend, et la relecture le confirme                      |
| Une fiche se crée de bout en bout                     | famille lue, fiche créée, éditorial écrit, fiche relue                |
| Un refus se rend en texte                             | « Aucune fiche pour l'identifiant nawak. »                            |

**Deux surprises, et elles ont changé le code :**

- 🔴 **Un schéma construit par `Object.fromEntries` perd l'inférence.** Le
  paramètre de type est `const` : les huit clés nutritionnelles dérivées d'une
  liste laissaient `args` avec les seuls identifiants, et la compilation l'a dit
  (`TS7053`). Les propriétés sont donc écrites **en clair**, et le commentaire
  au-dessus dit pourquoi — sans quoi quelqu'un les factorisera de nouveau.
- 🔴 **Écrire la nutrition efface les allergènes.** Le backend remplace la
  déclaration réglementaire ENTIÈRE ; poser une seule valeur nutritionnelle les
  emporterait. L'outil relit donc la fiche et les réécrit à l'identique — et
  **refuse** quand ils valent `null`, parce qu'écrire alors reviendrait à
  affirmer « aucun allergène » sur une fiche où personne ne s'est prononcé.
  C'est le cas des trois états, rencontré une fois de plus.

**Ce qui reste ouvert :** le comportement du serveur sur un tableau d'allergènes
en doublon (§6) n'est toujours pas constaté — aucun outil ne les écrit, donc rien
ne presse, et c'est la condition pour en ajouter un.
