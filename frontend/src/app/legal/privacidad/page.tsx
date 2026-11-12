import { AppHeader } from "../../../components/AppHeader/AppHeader";
import AppFooter from "../../../components/AppFooter/AppFooter";
import { Documentation } from "../../../components/StitchDocs/Documentation";

export const metadata = {
  title: "Política de privacidad — PianoMentor AI",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface antialiased">
      <AppHeader />
      <Documentation initialSlug="privacidad" />
      <AppFooter />
    </div>
  );
}
