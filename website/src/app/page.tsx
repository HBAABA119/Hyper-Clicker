import { Architecture } from "@/components/Architecture";
import { Ceiling } from "@/components/Ceiling";
import { Comparison } from "@/components/Comparison";
import { Download } from "@/components/Download";
import { Faq } from "@/components/Faq";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Install } from "@/components/Install";
import { Nav } from "@/components/Nav";
import { Simulator } from "@/components/Simulator";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
        <Ceiling />
        <Simulator />
        <Architecture />
        <Comparison />
        <Faq />
        <Download />
        <Install />
      </main>
      <Footer />
    </>
  );
}