import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PHProvider } from "@/components/posthog-provider";

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
  title: "Tuition App — Run your whole teaching business from one place",
  description:
    "Batches, scheduling, attendance, materials, homework, and fee tracking for tutors in Chennai & Tamil Nadu. Students and parents follow along on mobile.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} font-sans antialiased`}>
        <PHProvider>{children}</PHProvider>
      </body>
    </html>
  );
}
