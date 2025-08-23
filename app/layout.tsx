import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata = {
  title: "SAM",
  description: "Search & Analysis Machine"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <div className="min-h-screen flex">
          <Sidebar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
