import { useTranslation } from "react-i18next";

/** Placeholder start screen; joining a table (QR pairing, ADR-0007) follows in stage 3. */
export function CompanionApp() {
  const { t } = useTranslation();
  return (
    <main className="companion">
      <h1>{t("companion.heading")}</h1>
      <p>{t("companion.placeholder")}</p>
    </main>
  );
}
