import "./globals.css";

export const metadata = {
  title: "Paid Agent Studio — Your next launch, handled.",
  description:
    "Brief an agent. Approve a quote. Get launch-ready product content, backed by an automatic quality-or-refund guarantee.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
