import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PHProvider } from "@/components/posthog-provider";
import { ToastProvider, TooltipProvider } from "@/components/ui";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scholar — Run your tuition smarter",
  description:
    "One platform for teachers, students, parents and academies in Chennai & Tamil Nadu to manage batches, attendance, materials, homework and fees — off WhatsApp and out of the notebook.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} font-sans antialiased`}>
        <PHProvider>
          <TooltipProvider delayDuration={200}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </PHProvider>
      </body>
    </html>
  );
}
