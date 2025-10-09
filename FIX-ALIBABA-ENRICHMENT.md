# Fix: Alibaba Enrichment Not Working

## Проблема

Після натискання кнопки "Find Info" в модальному вікні організації, енрічмент по Алібабі (та інших платформах) не працював - інформація не виводилась або пошук не виконувався взагалі.

## Причина

Неузгодженість назв змінних оточення між різними файлами:

### До виправлення:

1. **`.env.example`** містив:
   ```env
   GOOGLE_SEARCH_API_KEY=your_key
   GOOGLE_CSE_ID=your_cx_id
   ```

2. **`lib/enrich/web.ts`** (використовується для Alibaba enrichment) шукав:
   ```typescript
   const key = getEnv("GOOGLE_CSE_API_KEY", "CSE_API_KEY");
   const cx  = getEnv("GOOGLE_CSE_CX", "CSE_CX");
   ```

3. **`app/api/search/route.ts`** (інший API endpoint) правильно використовував:
   ```typescript
   const key = process.env.GOOGLE_SEARCH_API_KEY;
   const cx = process.env.GOOGLE_CSE_ID;
   ```

### Наслідок:

Навіть якщо користувач правильно налаштував змінні згідно з `.env.example`, функція `searchWeb()` в `lib/enrich/web.ts` не знаходила ключі API, повертала порожні результати, і Alibaba enrichment не працював.

## Рішення

Оновлено `lib/enrich/web.ts` для використання правильних назв змінних з `.env.example`:

```typescript
// Було:
const key = getEnv("GOOGLE_CSE_API_KEY", "CSE_API_KEY");
const cx  = getEnv("GOOGLE_CSE_CX", "CSE_CX");

// Стало:
const key = getEnv("GOOGLE_SEARCH_API_KEY", "GOOGLE_CSE_API_KEY");
const cx  = getEnv("GOOGLE_CSE_ID", "GOOGLE_CSE_CX");
```

### Зміни:

1. **Пріоритет:** Спочатку шукаємо змінні з `.env.example` (`GOOGLE_SEARCH_API_KEY`, `GOOGLE_CSE_ID`)
2. **Fallback:** Якщо не знайдено, шукаємо старі назви для зворотної сумісності (`GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`)

## Що було виправлено

### Файли:

1. **`lib/enrich/web.ts`**
   - Змінено назви змінних оточення на правильні
   - Додано fallback для зворотної сумісності

2. **`ENRICHMENT-IMPROVEMENTS.md`**
   - Оновлено документацію з правильними назвами змінних

### Тестування:

Створено тест-скрипт для перевірки правильності назв змінних:
```bash
node /tmp/test-env-vars.js
```

Результат:
```
✓ Primary API key name is correct (GOOGLE_SEARCH_API_KEY)
✓ Primary CX/ID name is correct (GOOGLE_CSE_ID)
✓ All checks passed!
```

## Як використовувати

1. **Налаштуйте змінні оточення** згідно з `.env.example`:
   ```env
   GOOGLE_SEARCH_API_KEY=your_google_api_key
   GOOGLE_CSE_ID=your_custom_search_engine_id
   OPENAI_API_KEY=your_openai_key
   ```

2. **Перезапустіть сервер**:
   ```bash
   npm run dev
   ```

3. **Тестуйте енрічмент:**
   - Відкрийте організацію в модальному вікні
   - Натисніть кнопку "Find Info"
   - Система тепер знайде Alibaba, Made-in-China, IndiaMART посилання

## Потік виконання

```
User clicks "Find Info"
  ↓
OpenOrganizationModal.onFindInfo()
  ↓
POST /api/enrich/org
  ↓
findPlatformsSimple()
  ↓
searchWeb()  ← Тут була проблема!
  ↓
Google Custom Search API
  ↓
Results returned
```

## Додаткові переваги

- **Зворотна сумісність:** Старі назви змінних все ще працюють як fallback
- **Консистентність:** Тепер всі частини системи використовують однакові назви
- **Документація:** Оновлена відповідно до фактичної імплементації

## Перевірка

Щоб перевірити, що ваші змінні налаштовані правильно, подивіться на логи в консолі при виконанні "Find Info":

```
[findPlatformsSimple] Starting search: { name: '...', enabled: {...}, options: {...} }
[searchWeb] Query: "Company Name Alibaba" → Results: 5
[findPlatformsSimple] Found Alibaba link: https://...
```

Якщо бачите `Results: 0` - перевірте налаштування `GOOGLE_SEARCH_API_KEY` та `GOOGLE_CSE_ID`.
