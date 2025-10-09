# Enrichment Feature Improvements

## Зміни виконано: 2025-01-08

### 🎯 Основні покращення:

#### 1. **Повний Fallback Ланцюг для Domain Resolution**
Тепер система намагається знайти домен в наступному порядку:
1. ✅ Прямий domain з input
2. ✅ Витягування domain з email (якщо не gmail/yahoo/hotmail)
3. ✅ Пошук в web за назвою компанії
4. ✅ **НОВИЙ:** Пошук в web за email адресою
5. ✅ **НОВИЙ:** Пошук в web за телефоном

**Файл:** `app/api/enrich/org/route.ts` (рядки 212-242)

---

#### 2. **Покращена Екстракція Соціальних Мереж**
- **LinkedIn confidence:** 0.8 → **0.95**
- **Facebook confidence:** 0.8 → **0.95**
- **ВИПРАВЛЕНО:** Додано маппінг `linkedin_url` та `facebook_url` в модалці
- Тепер соц мережі можна застосувати через UI

**Файли:** 
- `app/api/enrich/org/route.ts` (рядки 349-350)
- `components/modals/OpenOrganizationModal.tsx` (рядки 292-304)

---

#### 3. **Автоматичне Визначення Країни через LLM**
- **НОВИЙ:** Використовує `detectCountryLLM` для контекстного визначення країни
- Аналізує текст з усіх сторінок (до 50k символів)
- Confidence залежить від LLM відповіді: high=0.9, medium=0.7, low=0.5
- Додано маппінг поля `country` в модалці

**Файли:**
- `app/api/enrich/org/route.ts` (рядки 353-372)
- `components/modals/OpenOrganizationModal.tsx` (рядки 306-312)

---

#### 4. **Покращена Фільтрація Email**
Додано blacklist для:
- Placeholder емейлів: `example.com`, `test.com`, `yourcompany.com`
- System емейлів: `noreply@`, `no-reply@`, `donotreply@`, `bounce@`, `mailer-daemon@`
- Platform емейлів: `sentry.io`, `wixpress.com`, `godaddy.com`, `wordpress.com`

**Файл:** `app/api/enrich/org/route.ts` (рядки 157-180)

---

#### 5. **Підвищені Confidence Рівні**

| Поле | Старе | Нове | Умова |
|------|-------|------|-------|
| **Email (preferred)** | 0.9 | **0.95** | info@, sales@, contact@, office@, hello@, support@, enquiry@, inquiry@ |
| **Email (corporate)** | 0.7 | **0.8** | Будь-який @domain |
| **Email (other)** | 0.4 | **0.5** | Не корпоративний |
| **Phone (international)** | 0.6 | **0.85** | Починається з + |
| **Phone (local)** | 0.6 | **0.75** | Без + |
| **Name (JSON-LD)** | 0.7 | **0.9** | З structured data |
| **Name (OpenGraph)** | 0.7 | **0.8** | З OG meta tags |
| **Name (Title)** | 0.7 | **0.7** | З <title> |
| **LinkedIn** | 0.8 | **0.95** | - |
| **Facebook** | 0.8 | **0.95** | - |

**Файл:** `app/api/enrich/org/route.ts` (різні секції)

---

#### 6. **Більше Сторінок для Парсингу**
Додано мультимовні шляхи:
- Українські: `про-нас`, `контакти`, `зв'язок`, `ua/contact`, `ua/about`
- Російські: `о-нас`, `о-компании`, `контакты`, `ru/contact`, `ru/about`
- Англійські: `en/contact`, `en/about`, `en/about-us`

**Файл:** `app/api/enrich/org/route.ts` (рядки 269-276)

---

#### 7. **Покращені HTTP Headers**
Додано реалістичні browser headers для кращого доступу до сайтів:
- User-Agent: Chrome 120
- Accept-Language: en, uk, ru
- Accept-Encoding: gzip, deflate, br
- DNT, Connection, Upgrade-Insecure-Requests

**Файл:** `app/api/enrich/org/route.ts` (рядки 64-85)

---

#### 8. **Покращений Trace для Діагностики**
- Додано кількість результатів для кожного етапу пошуку
- Додано `country: false` в extracted fields
- Кращі повідомлення про успішність кожного етапу

**Файл:** `app/api/enrich/org/route.ts` (рядки 190-196, 218, 224, 230)

---

## 🧪 Тестування

### Сценарій 1: Тільки Email (без корпоративного домену)
**Input:** `john@gmail.com`
**Очікується:**
1. Domain не витягнеться з email (gmail excluded)
2. Пошук в web за `"john@gmail.com"`
3. Якщо знайдено сайт → парсинг контактів
4. Визначення країни через LLM

### Сценарій 2: Тільки Телефон
**Input:** `+380991234567`
**Очікується:**
1. Пошук в web за `"+380991234567"`
2. Знайдений сайт → парсинг
3. Країна визначається за телефоном + LLM

### Сценарій 3: Назва + Країна
**Input:** `name: "Fujifilm Ukraine", country: "Ukraine"`
**Очікується:**
1. Пошук без параметра країни (як запитано користувачем)
2. Парсинг знайденого сайту
3. LLM визначить країну з контенту

### Сценарій 4: Соціальні Мережі
**Очікується:**
- LinkedIn/Facebook знаходяться з confidence 0.95
- Можна застосувати через чекбокси в UI
- Зберігаються в поля `linkedin_url`, `facebook_url`

---

## 📋 Checklist для Перевірки

- [ ] Email search fallback працює (gmail/yahoo → web search)
- [ ] Phone search fallback працює (якщо email не дав результату)
- [ ] LinkedIn/Facebook з'являються в suggestions і можна apply
- [ ] Країна визначається через LLM і можна apply
- [ ] Confidence рівні вищі для якісніших даних
- [ ] Мультимовні сторінки парсяться (укр/рус/англ)
- [ ] Фільтруються спам емейли (noreply@, example.com, тощо)
- [ ] Trace показує детальну інформацію про кожен етап

---

## 🔧 Налаштування

Переконайтеся що в `.env.local` або Settings є:
```env
GOOGLE_SEARCH_API_KEY=your_key
GOOGLE_CSE_ID=your_cx
OPENAI_API_KEY=your_openai_key
```

Без цих ключів:
- Web search не працюватиме (fallback по email/phone не спрацює)
- LLM визначення країни не працюватиме

---

## 📝 Примітки

1. **Пошук за країною вимкнено** як запитано - тепер `searchByName(name, null)` замість `searchByName(name, country)`
2. **Clear/Cancel buttons не додано** - користувач просто не ставить чекбокси
3. **Consistency в парсингу:**
   - Emails: blacklist + пріоритизація корпоративних
   - Phones: приоритет за labels > international > general
   - Socials: regex match для company/school URLs
   - Country: LLM з контекстом (не heuristics)


