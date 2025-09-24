export const dynamic = "force-dynamic";
// Використовуємо boolean (false) – вимикаємо ISR / статичний пререндер для цього сегмента
export const revalidate = false;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ніякого додаткового оболонкового DOM не додаємо, щоб не ламати стилі/висоту
  return children;
}
