# Prospect Tasks System - Setup Guide

## Overview
Повноцінна система prospect-менеджменту з Kanban-бордом для відстеження роботи з новими компаніями.

## Features
- ✅ **Окремий борд для prospects** з власним workflow
- ✅ **Автоматичне витягування даних з Search** (бренди, країна, контакти, LLM аналіз)
- ✅ **Drag & Drop** між колонками
- ✅ **Multi-tenant** підтримка
- ✅ **Dedupe protection** - одна компанія = один prospect
- ✅ **Rich company data** - contacts, brands, score, країна, тип компанії

## Database Setup

### 1. Створи таблиці в Neon Console

Виконай SQL з файлу `migration-create-prospect-tasks.sql`:

```sql
-- Tables created:
-- 1. prospect_boards (per tenant)
-- 2. prospect_columns (kanban columns)
-- 3. prospect_tasks (rich prospect data)
-- 4. prospect_task_comments (notes/comments)
```

### 2. Перевір що таблиці створились

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'prospect%';
```

Expected output:
- prospect_boards
- prospect_columns
- prospect_tasks
- prospect_task_comments

## Workflow Columns

Дефолтні колонки (автоматично створюються при першому доступі):

1. **To Contact** — нові prospects, ще не зв'язувались
2. **Contacted** — вже зв'язувались (email/phone/linkedin)
3. **Send Offer** — готові відправити оффер/proposal
4. **Waiting Reply** — чекаємо відповіді
5. **Negotiating** — в процесі переговорів
6. **Won** — успішно закрили deal ✅
7. **Lost** — не вийшло ❌

## How to Use

### 1. Знайди компанію в Search
- Перейди в **Searches**
- Введи пошуковий запит (напр. "medical imaging distributors")
- Запусти **Analyze** для LLM scoring
- Натисни **Deep Analyze** для витягування контактів

### 2. Додай до Prospect Tasks
- Натисни кнопку **"+ Tasks"** на картці результату
- Prospect автоматично додається в колонку "To Contact"
- Всі дані переносяться: score, бренди, країна, контакти, snippet

### 3. Працюй з prospects
- Перейди в **Tasks → Prospects** tab
- Drag & Drop prospects між колонками по мірі progress
- Клікни на картку для деталей (контакти, бренди, notes)
- Додавай коментарі для історії комунікації

## Data Captured

Для кожного prospect зберігається:

**Company Info:**
- Domain, homepage, company name
- Snippet (description)

**Scoring:**
- Label (GOOD/MAYBE/BAD)
- Confidence score
- Reasons (LLM explanation)
- Company type (manufacturer/distributor/dealer)

**Location:**
- Country ISO2 code
- Country name
- Detection confidence (HIGH/WEAK)

**Contacts:**
- Emails (array)
- Phones (array)

**Brands:**
- Matched brand names (array)

**Analysis:**
- Pages analyzed count
- Deep analysis timestamp

**Task Management:**
- Priority (Low/Normal/High/Urgent)
- Status (auto from column)
- Owner, assignees, tags
- Due date
- Progress %
- Comments history

## API Endpoints

Created:
- `GET  /api/prospects/board` — get board with columns & tasks
- `POST /api/prospects/tasks` — create prospect from search result
- `GET  /api/prospects/tasks/[id]` — get task details
- `PATCH /api/prospects/tasks/[id]` — update task (move, priority, etc)
- `DELETE /api/prospects/tasks/[id]` — archive task
- `POST /api/prospects/tasks/[id]/comments` — add comment

## Components

Created:
- `components/tasks/ProspectTasksView.tsx` — Kanban board UI
- `app/api/prospects/**` — API routes
- Updated: `app/tasks/page.tsx` — added tabs
- Updated: `components/search/ResultCard.tsx` — added "+ Tasks" button

## Tips

1. **Використовуй Deep Analysis** перед додаванням до Tasks — так будуть контакти
2. **Додавай теги** для сегментації (region, product type, etc)
3. **Встановлюй Due Dates** для followup нагадувань
4. **Drag & Drop** = автоматичне оновлення timestamps (contacted_at, replied_at, won_at)
5. **Archive lost prospects** — звільнюй борд від старих leads

## Next Steps (можливі покращення)

- Email integration (send directly from task card)
- LinkedIn outreach tracking
- Auto-reminders for followups
- Pipeline analytics (conversion rates)
- Bulk import from CSV
- Scheduled re-scoring of old prospects

## Questions?

Check:
- API logs для debugging
- Browser console для frontend errors
- Neon dashboard для SQL queries

