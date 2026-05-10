import "./globals.css";

export const metadata = {
  title: "Local Ollama Expert Panel",
  description: "12 Open Source LLM Personas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
