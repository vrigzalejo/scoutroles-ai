import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";

export const metadata: Metadata = {
  title: "How to use ScoutRoles",
  description: "Sign in, rank public roles against your resume, draft a letter, and track what you send.",
};

export default function HelpPage() {
  return (
    <InfoPage
      title="How to use ScoutRoles"
      lede="ScoutRoles reads your resume, ranks public job posts, and keeps a tracker. You send each application yourself."
    >
      <InfoSection title="Sign in">
        <p>Choose Google or GitHub. The free account is what lets you search roles and save the tracker.</p>
      </InfoSection>
      <InfoSection title="Add your resume">
        <p>Paste the text, or upload a PDF or Word file. Add the kind of role you want and a location. Turn on remote-only when you want remote posts.</p>
        <p>The original file stays in this browser. The text is saved with your account so the same resume is there the next time you sign in.</p>
      </InfoSection>
      <InfoSection title="Rank open roles">
        <p>Press Rank open roles. ScoutRoles reads public job feeds and scores each post against the words in your resume. A higher score means more of the posting already shows up in your resume.</p>
        <p>Open a role to see what matched, what is missing, and a link back to the original listing.</p>
      </InfoSection>
      <InfoSection title="Write a letter">
        <p>Inside a role, draft a letter from the resume and that posting. Facts stay as they are written in the resume. The draft does not add employers, titles, dates, or numbers that are not already there. The letter button says Queued letter while it waits, then Writing letter while Gemini works. This page keeps checking until it finishes.</p>
      </InfoSection>
      <InfoSection title="Generate a document">
        <p>Generate document asks Gemini for a one-page resume aimed at that role. That button says Queued document while it waits, then Writing document while Gemini works. It is saved only when Gemini returns one. You can download the Word file and attach it yourself.</p>
      </InfoSection>
      <InfoSection title="Apply on the company site">
        <p>Open listing leaves ScoutRoles and opens the posting. Copy the letter, paste it into the company’s form, and send it there. ScoutRoles does not sign in to job sites or submit applications.</p>
      </InfoSection>
      <InfoSection title="Keep a tracker">
        <p>Save a role, then mark it applied, interview, offer, or passed. Notes and the letter stay with that role. The Tracker tab lists them.</p>
      </InfoSection>
      <InfoSection title="Run autopilot">
        <p>Autopilot prepares a letter for the strongest matches, then opens one posting at a time. Copy the letter, send the form on that site, and press I sent it. That button stays off until the posting has been opened. Skip leaves the role unmarked.</p>
      </InfoSection>
    </InfoPage>
  );
}
