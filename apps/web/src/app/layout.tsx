import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PROJECT_DESCRIPTION, PROJECT_NAME } from "@event-hub/config/project";

import "./globals.css";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: PROJECT_DESCRIPTION,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
