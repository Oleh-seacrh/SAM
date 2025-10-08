# Organization Modal V2 - Summary

## ✅ Що зроблено:

### 1. **SQL Міграція** (`migration-expand-organizations.sql`)
- ✅ Додано `alibaba_url TEXT`
- ✅ Додано `made_in_china_url TEXT`
- ✅ Додано `indiamart_url TEXT`
- ✅ Додано `contacts JSONB DEFAULT '[]'::jsonb`
- ✅ Автоматична міграція legacy contacts → JSONB array
- ✅ Індекси для нових полів (performance optimization)

### 2. **Нова Модалка** (`OpenOrganizationModal-v2.tsx`)

#### Структура UI з 4 секціями:
```
┌─ Company Information ────────────┐
│ • Company name, Domain           │
│ • Country, Industry              │
└──────────────────────────────────┘

┌─ Social Media & Platforms ───────┐
│ • LinkedIn, Facebook             │
│ • Alibaba, Made-in-China         │
│ • IndiaMART                      │
└──────────────────────────────────┘

┌─ Contacts [+ Add Contact] ───────┐
│ • General Email                  │
│ ┌─ Contact 1 ──────[Remove]────┐│
│ │ Name, Position                ││
│ │ Email, Phone                  ││
│ └───────────────────────────────┘│
│ ... до 3-х контактів ...         │
└──────────────────────────────────┘

┌─ Business Information ───────────┐
│ • Status, Size, Source, Tags     │
│ • Brand, Product, Quantity       │
│ • Deal Value, Last Contact       │
│ • Notes (textarea)               │
└──────────────────────────────────┘
```

#### Ключові фічі:
- ✅ **Множинні контакти** (max 3)
  - Кнопка "+ Add Contact" (зелена)
  - Кнопка "Remove" для кожного контакту (червона)
  - Position field (нове)
- ✅ **5 Social/Platform URLs**
  - LinkedIn, Facebook (старі)
  - Alibaba, Made-in-China, IndiaMART (нові)
- ✅ **Responsive grid** (2 колонки на великих екранах, 1 на малих)
- ✅ **Візуальні секції** з border та заголовками
- ✅ **Скролл** для великого контенту
- ✅ **Backward compatibility** з legacy полями

### 3. **API Оновлення** (`app/api/orgs/[id]/route.ts`)
- ✅ Додано обробку `alibaba_url`, `made_in_china_url`, `indiamart_url`
- ✅ Додано обробку `contacts` JSONB array
- ✅ Автоматична синхронізація з legacy полями:
  - `contacts[0]` ↔️ `contact_name`, `contact_email`, `contact_phone`
- ✅ Фільтрація порожніх контактів при збереженні
- ✅ Правильний JSONB casting (`${contacts}::jsonb`)

---

## 📊 Порівняння Старого та Нового:

| Feature | Old Modal | New Modal V2 |
|---------|-----------|--------------|
| **Contacts** | 1 (fields) | До 3 (JSONB array) |
| **Position field** | ❌ | ✅ |
| **Social Platforms** | 2 (LinkedIn, FB) | 5 (+ Alibaba, MIC, IndiaMART) |
| **UI Structure** | Flat form | 4 секції |
| **Responsive** | Grid 2-col | Grid 2-col + секції |
| **Visual sections** | ❌ | ✅ Borders + titles |
| **Add/Remove buttons** | ❌ | ✅ Green/Red |
| **Scrollable** | Так | Так (max-h-90vh) |
| **Find Info** | ✅ | ✅ (працює з усіма полями) |

---

## 🗄️ Структура Даних:

### Нова таблиця `organizations`:
```sql
-- Existing columns...
+ alibaba_url TEXT
+ made_in_china_url TEXT
+ indiamart_url TEXT
+ contacts JSONB DEFAULT '[]'::jsonb

-- Legacy columns (зберігаються для backward compatibility):
contact_name TEXT
contact_email TEXT
contact_phone TEXT
```

### Формат `contacts` JSONB:
```json
[
  {
    "name": "John Doe",
    "email": "john@company.com",
    "phone": "+1234567890",
    "position": "Sales Manager"
  },
  {
    "name": "Jane Smith",
    "email": "jane@company.com",
    "phone": "+0987654321",
    "position": "CEO"
  }
]
```

---

## 🚀 Як використовувати:

### Крок 1: Запусти SQL міграцію
```bash
psql 'your_neon_connection_string' < migration-expand-organizations.sql
```

### Крок 2: Заміни модалку
```bash
# Backup
mv components/modals/OpenOrganizationModal.tsx components/modals/OpenOrganizationModal-old.tsx

# Use new version
mv components/modals/OpenOrganizationModal-v2.tsx components/modals/OpenOrganizationModal.tsx
```

### Крок 3: Тестування
1. Відкрий існуючу організацію → перевір міграцію legacy контакту
2. Додай новий контакт → перевір збереження в `contacts` JSONB
3. Додай Alibaba URL → перевір збереження
4. Використай "Find Info" → перевір що suggestions працюють

---

## 📁 Файли:

### Створені файли:
1. ✅ `migration-expand-organizations.sql` - SQL міграція
2. ✅ `components/modals/OpenOrganizationModal-v2.tsx` - Нова модалка
3. ✅ `ORGANIZATION-MODAL-V2-MIGRATION.md` - Детальна інструкція
4. ✅ `ORGANIZATION-MODAL-V2-SUMMARY.md` - Цей файл

### Оновлені файли:
1. ✅ `app/api/orgs/[id]/route.ts` - Підтримка нових полів
2. ⏳ `components/modals/OpenOrganizationModal.tsx` - **Потрібно замінити на v2**

---

## ⚠️ Важливо:

1. **Не видаляй legacy поля** (`contact_name`, `contact_email`, `contact_phone`) - вони потрібні для backward compatibility
2. **Contacts JSONB** - порожні об'єкти автоматично фільтруються
3. **Max 3 contacts** - UI обмеження, можна змінити в константі
4. **Find Info** - працює, але не витягує Alibaba/MIC/IndiaMART URL (це можна додати пізніше в enrichment)

---

## 🎨 Приклад використання:

### Додавання організації з 2 контактами:
```typescript
const org = {
  name: "Fujifilm Ukraine",
  domain: "fujifilm.ua",
  country: "UA",
  industry: "NDT",
  linkedin_url: "https://linkedin.com/company/fujifilm-ukraine",
  alibaba_url: "https://alibaba.com/company/fujifilm",
  general_email: "info@fujifilm.ua",
  contacts: [
    {
      name: "Milos Codreanu",
      position: "Sales Manager",
      email: "procurement@gisbar.org",
      phone: "+40 (31) 229 9499"
    },
    {
      name: "Anna Petrova",
      position: "CEO",
      email: "anna@fujifilm.ua",
      phone: "+380991234567"
    }
  ]
};
```

---

## 🔄 Next Steps (Optional):

1. **Enrichment для платформ**: Додати автоматичне визначення Alibaba/MIC/IndiaMART URLs через Find Info
2. **Contacts import**: Можливість імпорту контактів з CSV
3. **Contact tags**: Додати tags для контактів (primary, secondary, etc.)
4. **Validation**: Додати email/phone validation в UI
5. **History**: Зберігати історію змін контактів


