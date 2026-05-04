import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";

import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Motion Movers — AI Object Detection",
  description: "Real-time AI object detection and inventory tracking from video or live camera feeds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="bg-light min-vh-100 d-flex flex-column">{children}</body>
    </html>
  );
}
