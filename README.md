# DeepSeek Harness

English | [中文](README.zh.md)

English version of this page — [README.en.md](README.en.md).

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

<a id="run"></a>

## Запуск

### Установка скриптом

Для автоматической установки из исходников на Ubuntu, Debian, Arch Linux, Astra Linux и Windows используйте универсальный скрипт [`DeepSeek-install.py`](DeepSeek-install.py) (Python 3, только стандартная библиотека):

```sh
python3 DeepSeek-install.py install
```

Скрипт сам проверяет окружение, устанавливает недостающие зависимости, клонирует репозиторий в `~/.dsh/source`, выполняет `pnpm install` и `pnpm run build`, затем печатает команду запуска.

Встроенный доктор находит и автоматически исправляет большинство проблем окружения:

```sh
python3 DeepSeek-install.py doctor --fix
```

Доктор учитывает особенности Astra Linux, где системный `npm` старее требуемого: в этом случае он предлагает установить Node.js из официального дистрибутива NodeSource вместо пакета из репозитория дистрибутива. Подробности — в [документации скрипта](docs/user/guide/install.md).

### Запуск из `npm`

Установите `Node.js`, затем выполните:

```sh
npx @deepseek-ai/dsh web
```

Команда поднимает Web UI на `http://127.0.0.1:3080` и при локальном запуске открывает его в браузере по умолчанию. При запуске через SSH печатается только URL хоста — локальный проброшенный адрес знает SSH-клиент или редактор. Флаг `--no-open` запускает сервер без открытия браузера. См. [руководство по Web UI](docs/user/guide/index.md).

<a id="run-from-source"></a>

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

**Важно:** версия pnpm закреплена в `package.json` (`packageManager: pnpm@11.7.0`), и запускать её нужно через Corepack — `corepack pnpm …` либо один раз на систему `corepack enable`, после чего голый `pnpm` сам резолвится через Corepack. Глобальный pnpm старее 10 не понимает `overrides` из `pnpm-workspace.yaml`: он молча перезаписывает `pnpm-lock.yaml`, и следующий `pnpm install` падает с ошибкой frozen lockfile. Скрипт синхронизации `python3 DeepSeek-sync.py` распознаёт такой перезаписанный lockfile и восстанавливает его автоматически.

**Веб-поиск:** поиск переиспользует провайдера, к которому уже подключён текущий чат, — отдельный ключ и endpoint не нужны. Провайдер `web-search-routerai` определяет активную модель агента (из заголовка сессии или `agent-default-model`), читает endpoint/ключ выбранного провайдера из секции `llm-pi-ai` в настройках и гоняет нативный серверный поисковый тул этого же провайдера (`web_search_preview` для OpenAI-совместимых, `web_search_20250305` для Anthropic-совместимых роутеров). Fallback-endpoint можно задать переменной `DEEPSEEK_SEARCH_BASE_URL` в `.env` либо в настройках Web UI, неймспейс `web-search-routerai` (поле `baseURL`); ключ берётся из того же `apiKeyEnv`, что и у выбранного провайдера.

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
