# TAARA Backend — NestJS + Prisma + Neon

API REST de la plateforme TAARA.

## Stack

- **NestJS 11** (Express)
- **Prisma 6** ORM
- **PostgreSQL** (Neon serverless)
- **Cloudinary** pour les images
- **JWT** (access 15min + refresh 30j avec rotation et révocation)
- **Swagger / OpenAPI** auto-généré
- **Pino** pour les logs structurés
- **Helmet + Throttler** pour la sécurité

## Démarrage

```bash
cp .env.example .env
# Renseigner au minimum :
#   DATABASE_URL  — connexion pooler Neon
#   DIRECT_URL    — connexion directe (pour les migrations)
#   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET — au moins 16 caractères

npm install
npm run prisma:generate
npm run prisma:migrate     # crée la base, applique le schéma
npm run prisma:seed        # crée admin/client/pro de démo
npm run start:dev          # http://localhost:3000/api
```

Documentation Swagger : http://localhost:3000/api/docs

## Endpoints disponibles (Phase 1)

### Auth (`/api/v1/auth`)

| Verbe | Route                 | Body                                                                                   |
|-------|-----------------------|----------------------------------------------------------------------------------------|
| POST  | `/register`           | `{ email, phone, firstName, lastName, password, userType? }`                           |
| POST  | `/login`              | `{ email, password }`                                                                  |
| POST  | `/refresh-token`      | `{ refreshToken }`                                                                     |
| POST  | `/logout`             | `{ refreshToken }` (Bearer)                                                            |
| POST  | `/verify-email`       | `{ token }`                                                                            |
| POST  | `/forgot-password`    | `{ email }`                                                                            |
| POST  | `/reset-password`     | `{ token, password }`                                                                  |

### Users (`/api/v1/users`)

| Verbe | Route               | Notes                                                                |
|-------|---------------------|----------------------------------------------------------------------|
| GET   | `/me`               | Profil complet + fiche pro + wallet                                  |
| GET   | `/:id`              | Détail (allégé pour les autres utilisateurs)                         |
| PUT   | `/:id`              | `{ firstName?, lastName?, phone? }`                                  |
| PUT   | `/:id/password`     | `{ currentPassword, newPassword }` — révoque toutes les sessions     |
| PUT   | `/:id/avatar`       | `multipart/form-data` champ `file`, max 5 MB, `image/*`              |
| POST  | `/upgrade-to-pro`   | Promeut un CLIENT en PRO et crée la fiche `Professional`             |

### Health

| Verbe | Route          |
|-------|----------------|
| GET   | `/api/v1/health` |

### Autres modules

Diagnostics (`/diagnostics` — accepte un `aiDiagnosis` déjà calculé sur l'appareil), professionnels, jobs + chat (REST + Socket.IO), notes, notifications, portefeuille, paiements (Stripe / Mobile Money / espèces), sous-traitance et admin. Liste complète dans Swagger (`/api/docs`).

Retraits : le pro demande (`POST /wallet/withdraw`), l'admin valide (`POST /admin/withdrawals/:id/approve`) ou refuse avec recrédit (`POST /admin/withdrawals/:id/reject`, `{ reason? }`).

## Modèle économique : abonnements des pros

- Le **client paie le pro en direct** (espèces, T-Money, Flooz). `POST /payments` avec `method: CASH` + `channel` enregistre seulement la déclaration : pas de commission, **pas de crédit du portefeuille** (donc rien à retirer).
- Les paiements en ligne sont refusés tant qu'aucun prestataire n'est branché (Stripe sans clé, Mobile Money non implémenté, webhook Mobile Money désactivé).
- TAARA se rémunère par l'**abonnement mensuel des pros** :
  - chaque nouveau pro reçoit `PRO_TRIAL_MONTHS` mois d'essai (3 par défaut) ;
  - seuls les pros abonnés ou en essai apparaissent dans `/professionals/search` et peuvent recevoir une demande ;
  - le pro paie `SUBSCRIPTION_MONTHLY_PRICE` FCFA/mois par Mobile Money aux numéros `SUBSCRIPTION_TMONEY_NUMBER` / `SUBSCRIPTION_FLOOZ_NUMBER` ;
  - un admin active / prolonge : `POST /admin/professionals/:id/subscription` `{ months, channel, amount?, reference? }`.
- Endpoints : `GET /subscriptions/plans` (public), `GET /subscriptions/me` (pro), `GET /admin/subscriptions?status=trial|active|expired`.

## IA (Gemma 4)

`POST /api/v1/ai/generate` relaie les diagnostics de l'app vers l'API Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`) :
la clé ne quitte jamais le serveur. Endpoint public (le diagnostic fonctionne sans compte), limité à 12 requêtes/min
par IP, texte et images uniquement (8 Mo max).

## Temps réel (Socket.IO)

Namespace `/chat`, authentification par le jeton d'accès (`auth: { token }`). Chaque connexion rejoint `user:<id>` ;
l'écran de chat rejoint `job:<id>` (`job:join` / `job:leave`). Évènements émis : `notification:new`,
`job:updated` (création, acceptation, refus, démarrage, fin, annulation), `message:new`, `typing`.

## Suppression de compte

`DELETE /api/v1/users/me` `{ password }` supprime définitivement le compte et ses données (exigence Google Play).

## Emails

`MAIL_PROVIDER` = `console` (dev : contenu loggé), `resend` (`RESEND_API_KEY`) ou `sendgrid` (`SENDGRID_API_KEY`). Les liens pointent vers `APP_URL`. Un échec d'envoi est loggé sans bloquer l'inscription.

## Tests

```bash
npm test
```

## Sécurité

- Mots de passe hashés bcrypt (cost = 12)
- Tokens de vérif/reset hashés SHA-256 en base
- Refresh tokens : rotation à chaque usage, détection de réutilisation = révocation de toute la famille
- Helmet + CORS configurable
- Throttler : 120 req / 60s par défaut

## Migration Neon

```bash
# Local
npm run prisma:migrate -- --name init

# Prod (CI / Cloud Run)
npm run prisma:deploy
```

## Compte admin de production

Ne pas lancer `prisma:seed` en production (mots de passe de démo publics). Créer l'admin avec :

```bash
ADMIN_EMAIL=moi@exemple.com ADMIN_PHONE=+22890000000 npm run admin:create
```

Un mot de passe aléatoire est généré et affiché une seule fois (ou fournir `ADMIN_PASSWORD`, 12 caractères min.).

## Compte de démo (après `prisma:seed`)

| Email             | Password     | Rôle   |
|-------------------|--------------|--------|
| admin@taara.app   | admin12345   | ADMIN  |
| pro@taara.app     | pro12345     | PRO    |
| client@taara.app  | client12345  | CLIENT |

## Phases suivantes

Voir la roadmap dans le [README racine](../README.md).
