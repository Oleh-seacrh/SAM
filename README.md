# SAM (Next.js 14 + TS + Tailwind) — Vercel-ready

Чистий каркас з фіксованим ESLint 8 (без lock-файлів і дублів конфігів).

## Запуск локально
```bash
npm i
npm run dev
```

## Деплой на Vercel
1. Створи **новий репозиторій** в GitHub і завантаж сюди всі файли (або `Upload files` з цієї папки). Не додавай lock-файли.
2. У Vercel → **Add New Project** → імпортуй репо.
3. Перевір:
   - Framework: **Next.js**
   - Node.js: **20**
   - Install Command: залиш за замовчуванням (`npm install`)
4. **Deploy**.

## Перевірка
- `/api/health` → `{ ok: true }`
- Сайдбар з розділами: Dashboard / Searches / Results / Analysis / Email / Clients / Settings

## Нотатки
- Клієнтські ENV мають мати префікс `NEXT_PUBLIC_`.
- Серверні інтеграції (googleapis тощо) — в окремих `app/api/*` з `export const runtime = "nodejs"`.
