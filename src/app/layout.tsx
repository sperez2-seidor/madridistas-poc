import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madridista Platinum | Madridistas",
  description:
    "Únete a Madridista Platinum y recibe la camiseta de la temporada, el pack de bienvenida y todas las ventajas Premium.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
