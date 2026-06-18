import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "옹보딩 — 통합 채용 ATS",
  description: "지원자 모집부터 AI 스크리닝, 배치까지 한 곳에서 관리하는 채용 운영 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
