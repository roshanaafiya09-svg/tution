import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { ValueStrip } from '@/components/landing/value-strip';
import { AudiencesSection } from '@/components/landing/audiences-section';
import { CapabilitiesSection } from '@/components/landing/capabilities-section';
import { ProductPreviewSection } from '@/components/landing/product-preview-section';
import { ChaosToClaritySection } from '@/components/landing/chaos-to-clarity-section';
import { TrustSection } from '@/components/landing/trust-section';
import { FinalCtaSection } from '@/components/landing/final-cta-section';
import { LandingFooter } from '@/components/landing/landing-footer';

export default function Home() {
  return (
    <main>
      <LandingNav />
      <LandingHero />
      <ValueStrip />
      <AudiencesSection />
      <CapabilitiesSection />
      <ProductPreviewSection />
      <ChaosToClaritySection />
      <TrustSection />
      <FinalCtaSection />
      <LandingFooter />
    </main>
  );
}
