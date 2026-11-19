import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import type { ResumeDocument } from "@/lib/resume-pdf";

const INK = "1C201E";
const PINE = "215C48";
const MUTED = "5C615E";
const RULE = "C7CCC4";
const PAGE = 12240;
const MARGIN = 1008;
const CONTENT = PAGE - MARGIN * 2;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function tidy(value: string): string {
  return value.replace(/^([•●▪*-]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim();
}

function run(text: string, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    font: "Arial",
    bold: options.bold,
    size: options.size ?? 21,
    color: options.color ?? INK,
  });
}

function contactRun(value: string): ParagraphChild {
  const link = /^(https?:\/\/|mailto:)/i.test(value) ? value : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : "";
  const text = run(value, { size: 18, color: MUTED });
  if (!link) return text;
  return new ExternalHyperlink({ link, children: [new TextRun({ text: value, font: "Arial", size: 18, color: PINE })] });
}

function body(children: ParagraphChild[], options: { before?: number; after?: number } = {}) {
  return new Paragraph({
    spacing: { before: options.before ?? 0, after: options.after ?? 40, line: 276, lineRule: LineRuleType.AUTO },
    children,
  });
}

export async function renderResumeDocx(doc: ResumeDocument): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 40, line: 276, lineRule: LineRuleType.AUTO },
      children: [run(doc.name || "Resume", { bold: true, size: 44 })],
    }),
  ];
  if (doc.headline) children.push(body([run(doc.headline, { size: 22, color: PINE })], { after: 20 }));
  if (doc.contacts.length) {
    const contacts = doc.contacts.flatMap((value, index) =>
      index === 0 ? [contactRun(value)] : [run("   ·   ", { size: 18, color: MUTED }), contactRun(value)],
    );
    children.push(body(contacts, { after: 80 }));
  }

  function heading(label: string) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80, line: 240, lineRule: LineRuleType.AUTO },
        border: { bottom: { color: RULE, space: 1, style: BorderStyle.SINGLE, size: 6 } },
        children: [run(label.toUpperCase(), { bold: true, size: 20, color: PINE })],
      }),
    );
  }

  if (doc.summary) {
    heading("Summary");
    children.push(body([run(tidy(doc.summary))]));
  }
  if (doc.skills.length) {
    heading("Skills");
    children.push(body([run(doc.skills.join("   ·   "))]));
  }
  for (const section of doc.sections) {
    heading(section.heading);
    for (const item of section.items) {
      const title = [item.title, item.org].filter(Boolean).join(", ");
      const when = tidy(item.when);
      if (title || when) {
        const dateWidth = 2600;
        children.push(
          new Table({
            width: { size: CONTENT, type: WidthType.DXA },
            columnWidths: [CONTENT - dateWidth, dateWidth],
            borders: NO_BORDERS,
            rows: [
              new TableRow({
                cantSplit: true,
                children: [
                  new TableCell({
                    borders: NO_BORDERS,
                    width: { size: CONTENT - dateWidth, type: WidthType.DXA },
                    margins: { top: 60, bottom: 20, left: 0, right: 120 },
                    children: [new Paragraph({ spacing: { after: 0 }, children: [run(title, { bold: true, size: 22 })] })],
                  }),
                  new TableCell({
                    borders: NO_BORDERS,
                    width: { size: dateWidth, type: WidthType.DXA },
                    margins: { top: 80, bottom: 20, left: 0, right: 0 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 0 },
                        children: [run(when, { size: 18, color: MUTED })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        );
      }
      for (const bullet of item.bullets) {
        const text = tidy(bullet);
        if (!text) continue;
        children.push(
          new Paragraph({
            numbering: { reference: "resume-bullets", level: 0 },
            spacing: { after: 40, line: 276, lineRule: LineRuleType.AUTO },
            children: [run(text)],
          }),
        );
      }
    }
  }
  const file = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 21 },
          paragraph: { spacing: { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 280, hanging: 180 } },
                run: { font: "Arial", size: 21 },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE, height: 15840 },
            margin: { top: 860, bottom: 860, left: MARGIN, right: MARGIN },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(file);
  return new Uint8Array(await blob.arrayBuffer());
}
