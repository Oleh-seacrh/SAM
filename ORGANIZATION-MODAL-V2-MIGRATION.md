# Organization Modal V2 - Migration Guide

## 🎯 Що нового:

### 1. **Множинні контакти (до 3-х)**
- Кнопка "+ Add Contact" для додавання нових контактів
- Кожен контакт має: Name, Position, Email, Phone
- Кнопка "Remove" для видалення (якщо більше 1 контакту)

### 2. **Нові платформи (B2B marketplaces)**
- Alibaba URL
- Made-in-China URL
- IndiaMART URL

### 3. **Структурована UI з секціями**
- **Company Information:** name, domain, country, industry
- **Social Media & Platforms:** LinkedIn, Facebook, Alibaba, Made-in-China, IndiaMART
- **Contacts:** general email + до 3-х персональних контактів
- **Business Information:** status, size, source, tags, brand, product, quantity, deal value, notes

### 4. **Покращений UX**
- Чіткі візуальні секції з border та padding
- Responsive grid (2 колонки на великих екранах)
- Кнопки з кольоровою індикацією (green для Add, red для Remove)
- Скролл для великого контенту

---

## 📋 Міграція Бази Даних

### Крок 1: Виконай SQL міграцію
```bash
# Підключись до Neon database
psql 'postgresql://neondb_owner:npg_duS2og0ksaVm@ep-wandering-cake-adves3lm-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# Виконай міграцію
\i migration-expand-organizations.sql
```

Або вручну виконай SQL з файлу `migration-expand-organizations.sql`:
```sql
-- Додати нові колонки
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS alibaba_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS made_in_china_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS indiamart_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]'::jsonb;

-- Мігрувати старі контакти в новий формат
UPDATE organizations
SET contacts = jsonb_build_array(
  jsonb_build_object(
    'name', contact_name,
    'email', contact_email,
    'phone', contact_phone
  )
)
WHERE contact_name IS NOT NULL 
   OR contact_email IS NOT NULL 
   OR contact_phone IS NOT NULL;

-- Додати індекси
CREATE INDEX IF NOT EXISTS idx_orgs_alibaba ON organizations(alibaba_url) WHERE alibaba_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_made_in_china ON organizations(made_in_china_url) WHERE made_in_china_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_indiamart ON organizations(indiamart_url) WHERE indiamart_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_contacts_gin ON organizations USING GIN (contacts);
```

### Крок 2: Замінити модалку

**Стара версія:** `components/modals/OpenOrganizationModal.tsx`
**Нова версія:** `components/modals/OpenOrganizationModal-v2.tsx`

```bash
# Backup старої версії
mv components/modals/OpenOrganizationModal.tsx components/modals/OpenOrganizationModal-old.tsx

# Використати нову версію
mv components/modals/OpenOrganizationModal-v2.tsx components/modals/OpenOrganizationModal.tsx
```

### Крок 3: API вже оновлено
Файл `app/api/orgs/[id]/route.ts` вже підтримує:
- ✅ Нові поля (alibaba_url, made_in_china_url, indiamart_url)
- ✅ JSONB contacts array
- ✅ Backward compatibility з legacy contact_name/email/phone

---

## 🔄 Backward Compatibility

### Старі контакти автоматично мігруються:
```json
// Старий формат (legacy fields):
{
  "contact_name": "John Doe",
  "contact_email": "john@example.com",
  "contact_phone": "+1234567890"
}

// Новий формат (contacts array):
{
  "contacts": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "position": ""
    }
  ]
}
```

### Legacy поля зберігаються:
- `contact_name`, `contact_email`, `contact_phone` НЕ видаляються
- Вони автоматично синхронізуються з `contacts[0]`
- Це дозволяє працювати з існуючими інтеграціями

---

## 📸 UI Changes

### До (OpenOrganizationModal.tsx):
```
┌─────────────────────────────────┐
│ Company name    │ Domain        │
│ Country         │ Industry      │
│ LinkedIn URL    │ Facebook URL  │
│ General email   │ Contact person│
│ Personal email  │ Phone         │
│ ... всі поля в одній формі ...  │
└─────────────────────────────────┘
```

### Після (OpenOrganizationModal-v2.tsx):
```
┌─────────────────────────────────────┐
│ ╔═══════════════════════════════╗ │
│ ║ Company Information           ║ │
│ ║ • name, domain, country, etc. ║ │
│ ╚═══════════════════════════════╝ │
│                                     │
│ ╔═══════════════════════════════╗ │
│ ║ Social Media & Platforms      ║ │
│ ║ • LinkedIn, Facebook          ║ │
│ ║ • Alibaba, Made-in-China      ║ │
│ ║ • IndiaMART                   ║ │
│ ╚═══════════════════════════════╝ │
│                                     │
│ ╔═══════════════════════════════╗ │
│ ║ Contacts     [+ Add Contact]  ║ │
│ ║ • General Email               ║ │
│ ║ ┌─ Contact 1 ──────[Remove]─┐║ │
│ ║ │ Name     │ Position        │║ │
│ ║ │ Email    │ Phone           │║ │
│ ║ └──────────────────────────  ┘║ │
│ ╚═══════════════════════════════╝ │
│                                     │
│ ╔═══════════════════════════════╗ │
│ ║ Business Information          ║ │
│ ║ • status, size, brand, etc.   ║ │
│ ╚═══════════════════════════════╝ │
└─────────────────────────────────────┘
```

---

## 🧪 Тестування

### Сценарій 1: Створення нової організації з 2 контактами
1. Відкрий модалку
2. Заповни Company Information
3. Натисни "+ Add Contact"
4. Заповни обидва контакти
5. Додай Alibaba URL
6. Save → Перевір в БД `contacts` JSONB

### Сценарій 2: Редагування існуючої організації (legacy)
1. Відкрий стару організацію (з contact_name/email/phone)
2. Модалка автоматично міграє в `contacts[0]`
3. Редагуй контакт
4. Save → Перевір що legacy поля оновлені

### Сценарій 3: Видалення контакту
1. Відкрий організацію з 2+ контактами
2. Натисни "Remove" на другому контакті
3. Save → Перевір що в БД тільки 1 контакт

### Сценарій 4: Find Info з новими платформами
1. Відкрий модалку
2. Введи domain
3. Натисни "Find Info"
4. Перевір чи suggestions включають LinkedIn, Facebook (якщо знайдено)
5. Apply selected → Перевір що URL збереглися

---

## ⚠️ Важливі Нотатки

1. **Contacts limit:** Максимум 3 контакти (UI обмеження)
2. **JSONB filter:** Порожні контакти (без name/email/phone) автоматично фільтруються при збереженні
3. **Legacy sync:** При збереженні `contacts[0]` → `contact_name`, `contact_email`, `contact_phone`
4. **Position field:** Новий optional field для посади контакту

---

## 📝 Checklist

- [ ] Виконано SQL міграцію в Neon
- [ ] Заміщено `OpenOrganizationModal.tsx` на v2
- [ ] Протестовано створення нової організації
- [ ] Протестовано редагування існуючої організації
- [ ] Протестовано додавання/видалення контактів
- [ ] Протестовано збереження Alibaba/Made-in-China/IndiaMART URLs
- [ ] Перевірено що legacy організації працюють
- [ ] Перевірено що "Find Info" працює з новими полями

---

## 🔧 Rollback (якщо потрібно)

Якщо щось пішло не так:

```bash
# Повернути стару модалку
mv components/modals/OpenOrganizationModal.tsx components/modals/OpenOrganizationModal-v2-broken.tsx
mv components/modals/OpenOrganizationModal-old.tsx components/modals/OpenOrganizationModal.tsx
```

БД rollback НЕ потрібен - нові колонки не порушують роботу:
- `alibaba_url`, `made_in_china_url`, `indiamart_url` - nullable
- `contacts` - має default `[]`
- Legacy поля залишаються незмінними


