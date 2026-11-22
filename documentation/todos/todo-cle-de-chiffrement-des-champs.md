# TODO — la clé de chiffrement des champs

> **Ouvert le 2026-11-22**, à la demande de Hugo (« note ça en dette »).
> 🔴 **Fait établi ce jour-là : Hugo ne possède plus la valeur de
> `FIELD_ENCRYPTION_KEY`.** Elle n'existe que dans le secret GitHub, qui la
> repose à chaque déploiement de l'API (`.github/workflows/deploy_lfd_api.yml`),
> et dans l'API qui tourne. Ni GitHub ni Cloudflare ne la rendent.

## La consigne, en attendant

**Ne pas toucher au secret GitHub `FIELD_ENCRYPTION_KEY`.** Un déploiement
ordinaire ne la change jamais ; seule une modification de ce secret le
ferait, et elle rendrait illisibles :

- les IBAN des clients et les preuves de mandat (PDF), scellés sous elle
  (`platform/crypto/aes-gcm-field-cipher.ts` refuse d'ouvrir une valeur dont
  l'empreinte n'est pas celle de la clé) ;
- les liens déjà envoyés qui reposent sur une clé **dérivée** d'elle (HKDF) :
  annulation des invités, désinscription, et les autres usages listés dans
  `apps/lfd-api/src/platform/config/app-config.ts`.

Rien ne serait détruit en base, mais sans l'ancienne valeur, rien ne se
rouvrirait.

## À faire, dans l'ordre

### 1. Le verrou au déploiement (petit)

- Relever l'empreinte de la clé actuelle en production — elle est en clair
  dans chaque valeur scellée, et ne révèle rien de la clé :

  ```sql
  SELECT split_part(iban_sealed, '.', 2) AS empreinte, count(*)
    FROM public.company_bank_accounts
   GROUP BY 1;
  -- attendu : une seule ligne ; plusieurs = la clé a déjà changé une fois ;
  -- aucune = aucun IBAN scellé, chercher l'empreinte ailleurs
  ```

- La ranger dans une **variable** GitHub (non secrète) :
  `FIELD_ENCRYPTION_KEY_FINGERPRINT`.
- Dans `deploy_lfd_api.yml`, **avant** de déployer : calculer l'empreinte du
  secret et la comparer à la variable ; différente → le déploiement s'arrête,
  la production garde l'image en place (« la prod ne tombe jamais »).

### 2. Reprendre la clé sans la lire (frontière de sécurité : plan contredit par `vitruve`)

L'API qui tourne connaît l'ancienne clé : on la lui fait changer elle-même,
sur le modèle de `ROUTE_PLANNER_TOKEN_NEXT`.

1. Hugo génère une nouvelle clé, la range **d'abord dans son gestionnaire de
   mots de passe**, puis dans GitHub sous `FIELD_ENCRYPTION_KEY_NEXT`.
2. Un **balayage de re-scellement** (cron, par lots, hors transaction,
   rejouable) ouvre chaque valeur sous l'ancienne clé et la rescelle sous la
   nouvelle : colonnes scellées **et** objets du stockage (preuves de
   mandat). Un **registre des colonnes scellées**, tenu par une porte, pour
   qu'aucune ne soit oubliée.
3. Quand il ne reste rien sous l'ancienne empreinte : la nouvelle devient
   `FIELD_ENCRYPTION_KEY`, `_NEXT` disparaît, la variable d'empreinte suit.
4. Les liens déjà envoyés qui dépendent d'une clé dérivée meurent à ce
   moment (acceptable en pré-release ; à décider après le lancement).

### 3. Le trousseau (protège des erreurs futures)

- Une clé **actuelle** qui scelle, des clés **retirées** qui ouvrent
  seulement ; la clé d'ouverture se choisit par l'empreinte de la valeur.
- Les clés dérivées se vérifient sous la clé actuelle puis sous les
  retirées, jusqu'à expiration des liens.
- Une clé retirée ne s'enlève que quand le balayage ne trouve plus rien sous
  elle.
- **Limite** : le trousseau protège d'un **changement**, jamais d'une
  **perte**. Une clé perdue reste perdue : la garder hors de GitHub et de
  Cloudflare est la vraie protection.
