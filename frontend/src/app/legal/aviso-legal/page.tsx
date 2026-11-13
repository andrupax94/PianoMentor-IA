import { AppHeader } from "../../../components/AppHeader/AppHeader";
import AppFooter from "../../../components/AppFooter/AppFooter";
import { Documentation } from "../../../components/StitchDocs/Documentation";

export const metadata = {
  title: "Aviso legal — PianoMentor AI",
};

export default function AvisoLegalPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface antialiased">
      <AppHeader />
      <Documentation initialSlug="aviso-legal" />
      <AppFooter />
    </div>
  );
}