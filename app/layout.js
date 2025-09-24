import { Inter } from "next/font/google";
import "./globals.css";
import {ClerkProvider } from '@clerk/nextjs';
import Header from "../components/Header.jsx";
import { Toaster } from "sonner";

const inter = Inter({subsets:["latin"]})

export const metadata = {
  title: "WELTH",
  description: "AI Expense Tracker",
};
 
export default function RootLayout({ children }) {
  return (
     <ClerkProvider>
      <Header/>
        <html lang="en">
      <body className={`${inter.className}`}>
        <main className ="main-h-screen">{children}</main>
        <Toaster richColors/>
        {/* <footer className ="bg-blue-50 py-12">
          <div className="container mx-auto px-4 text-center text-gery-600">
            <p>Kalyani Mogre</p>
          </div> */}

        {/* </footer> */}
      </body>
    </html>
     </ClerkProvider>
  
  );
}
