import type { Job, Profile } from "@/lib/types";

export const sampleProfile: Pick<Profile, "name" | "roles" | "location" | "resume"> = {
  name: "Alex Rivera",
  roles: "frontend engineer",
  location: "remote",
  resume: `Alex Rivera
San Francisco, CA · remote
alex.rivera@example.com

Frontend engineer. I build React and Next.js products, and I write the TypeScript around them.

Experience
Senior Frontend Engineer, Northwind Labs — 2022 to present
- Shipped a Next.js dashboard in TypeScript and React
- Built a design system in Tailwind, with accessibility fixes
- Partnered with product and design in Figma and shipped weekly

Software Engineer, Harbor — 2019 to 2022
- React interfaces and Python services for a logistics tool
- PostgreSQL, Node.js, and AWS

Skills
TypeScript, JavaScript, React, Next.js, Node.js, Python, PostgreSQL, AWS, Figma, CSS, HTML, REST, Tailwind, Docker
`,
};

export const sampleJobs: Job[] = [
  {
    id: "sample:1",
    title: "Senior Frontend Engineer",
    company: "Sample Studio",
    location: "Remote, North America",
    remote: true,
    salary: "$150k-$180k",
    description:
      "Build the product in React, Next.js, and TypeScript. You will work with design in Figma, keep the UI accessible, and ship with a small team. PostgreSQL and Node.js sit behind the app. AWS experience helps.",
    tags: ["React", "TypeScript", "Next.js", "Figma"],
    url: "https://remotive.com",
    applyUrl: "https://remotive.com",
    source: "Sample",
    sourceHome: "https://remotive.com",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "sample:2",
    title: "Product Designer",
    company: "Sample Atelier",
    location: "Remote",
    remote: true,
    salary: "$120k-$145k",
    description:
      "Own product design in Figma from research through shipped UI. You partner with frontend engineers and care about accessibility. A portfolio is required.",
    tags: ["Figma", "UI", "UX", "Research"],
    url: "https://remoteok.com",
    applyUrl: "https://remoteok.com",
    source: "Sample",
    sourceHome: "https://remoteok.com",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "sample:3",
    title: "Data Analyst",
    company: "Sample Metrics",
    location: "Berlin or remote in Europe",
    remote: true,
    salary: "",
    description:
      "SQL, Excel, and clear writing. You will build dashboards and explain what changed. Python is a plus. This is not a frontend role.",
    tags: ["SQL", "Excel", "Analytics"],
    url: "https://www.arbeitnow.com",
    applyUrl: "https://www.arbeitnow.com",
    source: "Sample",
    sourceHome: "https://www.arbeitnow.com",
    publishedAt: new Date().toISOString(),
  },
  {
    id: "sample:4",
    title: "Full Stack Engineer",
    company: "Sample Harbor",
    location: "Remote",
    remote: true,
    salary: "$130k-$160k",
    description:
      "TypeScript, React, Node.js, and PostgreSQL. Docker and AWS in production. You will talk to customers and write the notes yourself.",
    tags: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"],
    url: "https://jobicy.com",
    applyUrl: "https://jobicy.com",
    source: "Sample",
    sourceHome: "https://jobicy.com",
    publishedAt: new Date().toISOString(),
  },
];
