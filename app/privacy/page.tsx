import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";

export const metadata: Metadata = {
  title: "Privacy · ScoutRoles",
  description: "What ScoutRoles stores, what stays in your browser, and what is sent when you ask for a letter.",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      lede="This page says what ScoutRoles stores and what it sends when you ask it to write."
    >
      <InfoSection title="Your account">
        <p>Sign-in uses Google or GitHub. The account stores the email those services confirm, the sign-in provider, and an id from that provider. A cookie on this browser keeps you signed in. The cookie is sent only to ScoutRoles.</p>
      </InfoSection>
      <InfoSection title="Resume and tracker">
        <p>The resume text, the roles you want, your location, letters, and tracker notes are saved with the account after you sign in. The original PDF or Word file, and any Word file generated for a role, stay in this browser. They are not uploaded as the file itself.</p>
        <p>A Gemini key you type into the page stays in this browser. It is cleared before the profile is saved to the account.</p>
        <p>Signing out can remove the resume and tracker stored on this browser. The account copy remains until you use the site again with that same sign-in.</p>
      </InfoSection>
      <InfoSection title="Letters and documents">
        <p>When you draft a letter or generate a document, the resume text and that job posting are sent to Google Gemini. That happens only when you ask. Ranking roles does not call Gemini.</p>
      </InfoSection>
      <InfoSection title="Job listings">
        <p>Roles come from public job feeds. Opening a listing sends you to the site that published it. ScoutRoles does not sign in there, fill its forms, or submit an application.</p>
      </InfoSection>
      <InfoSection title="Analytics">
        <p>ScoutRoles uses Google Analytics to count visits and see which pages are opened. Google receives the page address, the browser, and a general location. The resume, letters, and account email are not sent there.</p>
      </InfoSection>
      <InfoSection title="What this site does not do">
        <p>ScoutRoles does not sell personal information. It does not add employers, titles, dates, or numbers that are not in your resume. It does not read private boards by signing in as you.</p>
      </InfoSection>
      <p className="text-sm text-muted">This page was last updated on November 19, 2026.</p>
    </InfoPage>
  );
}
