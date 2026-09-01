# DeepSeek Harness

[English](README.md) | [中文](README.zh.md) | Русский

DeepSeek Harness (`dsh`) — открытый agent harness (агентный фреймворк) разработки [DeepSeek AI](https://deepseek.com).

Построен на архитектуре **«всё — плагин»** и работает поверх [Cordis](https://github.com/cordiverse/cordis); дизайн описан в статье [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Документация: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Русская локализация

Этот форк добавляет русский язык в веб-интерфейс (`pnpm dsh web`). Локализация оформлена пакетом-языковым паком [`@deepseek-ai/dsh-client-locale-ru`](packages/extensions/locale-ru/README.md) — ядро `dsh-client-locale` не изменено, весь интерфейс переводится данными, а не правками кода.

Что это даёт:

- В **Settings → General → Language** появляется пункт **Русский** (после 中文 и English); выбор сохраняется между сессиями.
- Браузер с основным языком `ru-RU` открывается сразу на русском; `<html lang>` страницы следует выбору.
- Переведено ~1050 строк клиентского интерфейса — 33 словаря по неймспейсам (чат, траектория, настройки, рабочее пространство и т.д.); непокрытые неймспейсы автоматически падают в английский по цепочке `ru → en`.
- Пакет монтируется одной строкой ростера в `packages/bundle/web-app/cordis.patch.yml`: удалите её — язык исчезнет; добавьте свой словарь через `ctx.locale.register(ns, 'ru', dict)` — покроете новый неймспейс.

Подробности — в [README пакета](packages/extensions/locale-ru/README.md).

## Developer preview

DeepSeek Harness находится в стадии _developer preview_ и быстро развивается. **Будут изменения, ломающие совместимость.**

Перед запуском проекта прочтите [уведомление о безопасности](SAFETY.md).

## Запуск

### Запуск из `npm`

Установите `Node.js`, затем выполните:

```sh
npx @deepseek-ai/dsh web
```

Команда поднимает Web UI на `http://127.0.0.1:3080` и при локальном запуске открывает его в браузере по умолчанию. При запуске через SSH печатается только URL хоста — локальный проброшенный адрес знает SSH-клиент или редактор. Флаг `--no-open` запускает сервер без открытия браузера. См. [руководство по Web UI](docs/user/guide/index.md).

### Запуск из исходников

Для запуска из чекаута репозитория:

```sh
git clone https://github.com/maksim9510/DeepSeek-Harnes.git
cd DeepSeek-Harnes
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` готовит артефакты репозитория. `pnpm dsh web` использует уже собранные артефакты и не пересобирает их.

## Сообщество и поддержка

- Отзывы и сообщения об ошибках — через [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) апстрима.
- Добавьте тему [`dsh-plugin`](https://github.com/topics/dsh-plugin) в репозиторий своего плагина — так его легче найти.
- Присоединяйтесь к <a href="https://discord.gg/Ycq5dCaS4">Discord-сообществу DeepSeek Harness</a>.

## Участие в разработке

См. [CONTRIBUTING.md](CONTRIBUTING.md).

## Разработка

Начните с [руководства по разработке](docs/development.md) и [документации по архитектуре](docs/architecture.md).

Для агентов — следуйте [AGENTS.md](AGENTS.md).

## Лицензия

[MIT](LICENSE)

Сторонние зависимости и их лицензии перечислены в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
