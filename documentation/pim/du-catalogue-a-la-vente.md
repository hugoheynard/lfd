# Du catalogue à la vente — la chaîne complète

> **Doc d'architecture.** Écrite le 2026-09-23, après une matinée passée à la
> reconstituer de six fichiers parce qu'elle n'existait nulle part d'un seul
> tenant. Deux des textes lus en route étaient périmés.
>
> Elle répond à une seule question : **« j'ai publié, pourquoi ce n'est pas en
> vente ? »**

---

## 1. Les cinq étapes, et ce qui bloque chacune

| #   | Étape                             | Ce qui la commande                                     |
| --- | --------------------------------- | ------------------------------------------------------ |
| 1   | **Saisir** la fiche               | rien                                                   |
| 2   | **Publier au catalogue**          | les **allergènes** déclarés (invariant 7)              |
| 3   | Être **vendue en contexte `b2b`** | la matrice de canaux — de la fiche, ou de sa famille   |
| 4   | **Pousser**                       | un geste humain, écran **Publication**                 |
| 5   | **Arriver** côté commerce         | le drapeau `B2B_DELIVERY_INBOX` — direct, ou réception |

🔴 **Chaque étape est franchie séparément.** Il n'existe aucun geste qui les
enchaîne, et c'est voulu : trois d'entre elles engagent quelque chose qu'on ne
rattrape pas.

---

## 2. Ce que « publier » ne fait PAS

**Publier bascule un statut. Ça n'envoie rien.**

L'écran le dit à l'endroit où l'on appuie, depuis l'audit du 2026-09-01 : une
fiche « en ligne » jamais poussée n'est en vente **nulle part**, et rien ne le
signalait.

Ce que la publication exige, et rien d'autre :

- le produit n'est pas archivé ;
- **toute déclinaison active déclare ses allergènes** — `[]` compte, c'est
  l'affirmation « aucun allergène ».

Ce qu'elle **n'exige pas**, contrairement à ce que le rail de complétude laisse
croire : ni visuel, ni prix, ni description, ni la signature « Déclarée
publiable ». Le rail mesure ce qui est _complet_ ; seul le bouton **« Déclarer
publiable »** en dépend, et lui n'est pas sur le chemin de la vente.

---

## 3. Pourquoi une fiche publiée ne part pas au push

Le push n'emporte que ce qui est publié **et** vendu en contexte `b2b`. Le reste
est écarté, **avec sa raison**, dans le bloc « Écartés » de l'écran Publication :

| Raison                           | Ce qu'elle dit                             |
| -------------------------------- | ------------------------------------------ |
| `canal_ferme`                    | non vendue aux professionnels              |
| `variant_sans_prix`              | une déclinaison n'a pas de tarif           |
| `variant_sans_taux`              | pas de taux de TVA résolu pour ce contexte |
| `variant_arretee`                | déclinaison arrêtée                        |
| `famille_inconnue`               | la famille du produit n'existe pas         |
| `produit_sans_variante_vendable` | plus rien à vendre après les exclusions    |

➡️ **`canal_ferme` est le cas courant**, et le plus déroutant : la fiche est
publiée, elle a l'air prête, et elle n'entre pas. Ça se règle sur la fiche,
section « Tarif & TVA », ou sur la **famille** dont elle hérite ses canaux.

⚠️ **Il n'y a qu'un seul canal** depuis la sortie de Shopify le 2026-09-21 : la
plateforme professionnelle. Plusieurs textes du dépôt parlaient encore de
« pousser vers la boutique » — ce geste n'existe pas. La boutique est servie par
ce qui arrive **côté commerce**, à l'étape 5.

---

## 4. Les deux drapeaux, et ce qu'ils commandent vraiment

Ce sont des **Variables de dépôt GitHub** (`vars`, pas `secrets`), lues au
déploiement, transmises au Worker puis au conteneur.

### `PIM_PUBLICATION_ENABLED`

Ferme **deux routes** : `POST /pim/channels/b2b/push` et
`POST /pim/catalogue/revisions`. Fermé par défaut, avec sa raison : _« l'extérieur
ne se rattrape pas, et un déploiement qui ne s'est pas prononcé doit se taire. »_

Ouvert le 2026-09-23.

### `B2B_DELIVERY_INBOX`

Choisit **où atterrit un push**, et c'est un seul chemin à la fois :

|        | Ce qui se passe                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| Fermé  | l'ingestion écrit **directement** les faits de vente — en ligne aussitôt          |
| Ouvert | le push dépose une **arrivée** dans l'écran **Réception**, qu'on valide à la main |

Ouvert le 2026-09-23. Avant cette date, un catalogue poussé passait **droit en
ligne sans étape de contrôle**, ce qui surprenait tout le monde y compris ceux
qui avaient écrit le code.

---

## 5. 🔴 Le piège qui coûte une heure

**Poser la variable ne suffit pas. Il faut une RÉVISION NEUVE.**

Trois mécanismes se combinent pour que relancer un déploiement sur le même
commit ne change **rien** :

1. `Backend extends Container` fige `envVars = pickEnv(this.env)` **à la
   construction de l'instance** ;
2. un cron `keepWarm` la sollicite plus souvent que son `sleepAfter`, donc
   **elle ne s'endort jamais** et ne se reconstruit jamais d'elle-même ;
3. l'étape « Attendre que l'image neuve serve » compare la **révision du code**
   (`GITHUB_SHA[0:7]`) à celle que `/health` annonce — sur le même commit, elle
   est satisfaite **du premier coup**, sans que rien ait redémarré.

➡️ Un changement de variable doit donc voyager avec un **commit**. Le
déploiement du 2026-09-23 06:20 le montre en clair :

```
Tentative 1/40 — révision servie : « 1e3f25a »   ← l'ancien conteneur
Tentative 4/40 — révision servie : « 1e3f25a »
L'image 8f0f17d répond (tentative 5).            ← le neuf
```

⚠️ Corollaire pour le déploiement de l'API : son filtre de chemins ne couvre que
`apps/lfd-api/**`, `packages/**` et `pnpm-workspace.yaml`. Un commit qui ne
touche que le front ou la documentation **ne le déclenche pas** — il faut un
`workflow_dispatch`.

---

## 6. Où regarder quand ça ne marche pas

| Symptôme                                  | Où c'est dit                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Pas de section **Diffusion** dans le menu | `GET /pim/capabilities` — l'appel échoue en silence si le droit `pim_channels` manque |
| Écran Publication vide                    | le bloc « Écartés », qui nomme la raison par SKU                                      |
| Poussé mais pas dans **Réception**        | `B2B_DELIVERY_INBOX` — et il faut une révision neuve                                  |
| Publié mais invisible partout             | jamais poussé : publier n'envoie rien (§2)                                            |

⚠️ **Le magasin des capacités ne charge qu'UNE fois**, dans son constructeur.
Un onglet ouvert avant un déploiement garde l'ancienne réponse pour toujours :
recharger la page est la première chose à faire.
