import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '轻课台 | 轻量智能教学系统',
  description: '以班级、资料、作业和反馈为核心的轻量教学工作台。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
