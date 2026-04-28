import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motion Movers — AI Object Detection",
  description: "Real-time AI object detection and inventory tracking from video or live camera feeds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-light min-vh-100 d-flex flex-column">{children}</body>
    </html>
  );
}
