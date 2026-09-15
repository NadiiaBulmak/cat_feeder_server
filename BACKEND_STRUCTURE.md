# Cat Feeder Backend

Короткий опис структури бекенду та бази даних.

## Стек

- NestJS 12, TypeScript, Express
- Prisma 5 + PostgreSQL (розширення `vector`)
- Vitest для unit/e2e тестів
- `class-validator` / `ValidationPipe` для DTO

## Структура проєкту

```text
src/
  main.ts                 # запуск, CORS, глобальна валідація
  app.module.ts           # кореневий модуль
  app.controller.ts       # GET /
  prisma/                 # PrismaModule і PrismaService
  auth/                   # AuthController, AuthService, DTO
  feeders/                # годівнички, DTO, сервіс і репозиторій
  camera/                 # керування камерою
  shared/enums.ts         # FeederState і FeederAction
prisma/
  schema.prisma           # схема БД
  migrations/             # міграції
  seed.ts                 # seed-скрипт
uploads/                  # локально збережені фотографії
```

## База даних

```text
User 1---N FeederStateHistory N---1 Feeder
User N---N Feeder
User 1---1 ResetToken
User 1---N AccessLog N---1 Feeder
Cat 1---N RfidTag
Cat 1---N CatFace
Cat 1---N AccessLog
Camera 1---N Photo
```

### Основні таблиці

| Модель | Призначення | Ключові поля |
| --- | --- | --- |
| `User` | користувачі та доступ до годівничок | `email` unique, `googleId` unique, `passwordHash` |
| `Feeder` | стан і пристрій годівнички | `deviceId` unique, `desiredState`, `actualState`, `lastPing` |
| `FeederStateHistory` | історія зміни стану | `feederId`, `state`, `source`, optional `userId` |
| `Cat` | домашні тварини | `name` |
| `RfidTag` | RFID-мітки котів | `tagValue` unique, `catId` |
| `CatFace` | дані розпізнавання обличчя | `faceData`, `catId` |
| `AccessLog` | відкриття годівнички | `feederId`, optional `catId`/`userId`, `trigger` |
| `Camera` | IP-камери | `ipAddress` unique, `name` |
| `Photo` | фотографії камер | `filename`, `cameraId` |
| `ResetToken` | токени скидання пароля | `userId` unique, `tokenHash` unique, `expiresAt` |

### Enum-и

- `FeederState`: `OPEN`, `CLOSED`
- `StateChangeSource`: `HUMAN`, `RFID`, `FACEID`
- `FeederAction` API: `open`, `close`

Зв'язки з `Feeder`, `Cat` і `User` видаляють залежні записи через `Cascade` або очищають optional-зв'язок через `SetNull`.

## HTTP API

Базовий URL: `http://localhost:3000`

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/` | health/тестова відповідь `Hello World!` |
| `POST` | `/feeders` | створити годівничку |
| `GET` | `/feeders` | отримати всі годівнички |
| `GET` | `/feeders/:id` | отримати годівничку |
| `PATCH` | `/feeders/:id/open` | відкрити годівничку |
| `PATCH` | `/feeders/:id/close` | закрити годівничку |
| `DELETE` | `/feeders/:id` | видалити годівничку |
| `POST` | `/camera/trigger` | зробити фото з ESP-камери та зберегти в `uploads/` |
| `POST` | `/auth` | поточний шаблон CRUD auth |
| `GET` | `/auth` | поточний шаблон CRUD auth |
| `GET` | `/auth/:id` | поточний шаблон CRUD auth |
| `PATCH` | `/auth/:id` | поточний шаблон CRUD auth |
| `DELETE` | `/auth/:id` | поточний шаблон CRUD auth |

## Запуск і конфігурація

```bash
npm install
npx prisma migrate deploy
npm run start:dev
```

Основні змінні `.env`: `DATABASE_URL`, `PORT`, `LOCAL_FRONTEND`, `VERCEL_FRONTEND`.
За замовчуванням сервер слухає `0.0.0.0:3000`; CORS дозволяє локальний і Vercel-фронтенди.

## Поточні обмеження

- Auth-ендпоінти ще не підключені до Prisma і повертають шаблонні рядки.
- CameraService використовує жорстко задану адресу `192.168.100.26` та пише JPG локально.
- Таблиці `Camera` і `Photo` поки не використовуються CameraService.
- JWT/сесії та авторизаційні guard-и в коді не реалізовані.