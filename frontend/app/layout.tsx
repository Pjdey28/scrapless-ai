import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScrapLess AI | Manufacturing intelligence",
  description: "Predict waste, optimize rectangular sheet cutting, and make every sheet count.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
