import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Challenge Tracker", template: "%s · Challenge Tracker" },
  description: "Set any goal, schedule it automatically, log your progress and see exactly how you're doing.",
  applicationName: "Challenge Tracker",
  appleWebApp: { capable: true, title: "Tracker", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f5" }, { media: "(prefers-color-scheme: dark)", color: "#121211" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
