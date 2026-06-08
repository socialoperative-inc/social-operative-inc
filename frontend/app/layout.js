import './globals.css';

export const metadata = {
  title: 'Social Operative Inc. — AI Commerce Intelligence',
  description: 'Futuristic AI mission control for e-commerce brands and digital marketers. Real-time AI agents, commerce intelligence, ad optimization.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#050507] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
