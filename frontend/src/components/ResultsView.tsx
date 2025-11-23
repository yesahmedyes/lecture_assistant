import { useState, useEffect } from "react";
import {
  FileText,
  Database,
  List,
  Download,
  Copy,
  Check,
  Presentation,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { SessionResult } from "../types";

interface Props {
  result: SessionResult;
}

type Tab = "slides" | "brief" | "sources" | "claims";

export default function ResultsView({ result }: Props) {
  // Set initial tab: slides if available, otherwise brief
  const [activeTab, setActiveTab] = useState<Tab>(
    result.slides ? "slides" : "brief"
  );
  const [copied, setCopied] = useState(false);

  // Update active tab when slides become available
  useEffect(() => {
    if (result.slides && activeTab === "brief") {
      setActiveTab("slides");
    }
  }, [result.slides]);

  // Helper function to clean markdown content from LLM output
  const cleanMarkdownContent = (content: string): string => {
    if (!content) return content;

    let cleaned = content.trim();

    // Remove markdown code block markers (```markdown, ```, etc.)
    // Handle opening markers at start of content
    cleaned = cleaned.replace(/^```[\w]*\n?/gm, "");
    // Handle closing markers at end of content
    cleaned = cleaned.replace(/\n?```$/gm, "");
    // Handle standalone code block markers on their own line
    cleaned = cleaned.replace(/^```[\w]*$/gm, "");
    // Remove any remaining backticks at start/end
    cleaned = cleaned.replace(/^`+|`+$/g, "");

    // Remove explanatory prefixes (case insensitive, with variations)
    cleaned = cleaned.replace(
      /^[\s\n]*(markdown\s+written|here['']s\s+the\s+markdown|here\s+is\s+the\s+markdown|markdown\s+format|formatted\s+markdown|here\s+is\s+the\s+formatted|below\s+is\s+the\s+markdown)[\s\n]*:?[\s\n]*/i,
      ""
    );

    // Remove common LLM explanatory text
    cleaned = cleaned.replace(
      /^(here\s+is|here['']s|below\s+is|see\s+below|output|result)[\s\n]*:?[\s\n]*/i,
      ""
    );

    // Remove any remaining leading/trailing whitespace, newlines, and backticks
    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/^`+|`+$/g, "");

    return cleaned.trim();
  };

  const handleCopy = async () => {
    let text = "";
    if (activeTab === "slides" && result.slides) {
      text = cleanMarkdownContent(result.slides);
    } else {
      text = cleanMarkdownContent(
        result.formatted_brief || result.final_brief || ""
      );
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    console.log("✓ Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSlides = () => {
    if (!result.slides) return;

    const slides = cleanMarkdownContent(result.slides);

    // Create PDF with 16:9 aspect ratio (widescreen presentation format)
    // Standard slide dimensions: 10" x 5.625" (or 254mm x 143mm)
    const slideWidth = 254; // mm
    const slideHeight = 143; // mm
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [slideWidth, slideHeight],
    });

    // Set up the slide
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    const contentHeight = pageHeight - 2 * margin - 15; // Leave space for slide number

    // Split slides by --- separator
    const slideSections = slides
      .split(/\n---\n|\n---$|^---\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    slideSections.forEach((slideContent, index) => {
      if (index > 0) {
        pdf.addPage();
      }

      // Draw subtle border around slide
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
      pdf.rect(5, 5, pageWidth - 10, pageHeight - 10);

      // Add slide number in bottom right
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(150, 150, 150);
      const slideNumText = `${index + 1} / ${slideSections.length}`;
      const slideNumWidth = pdf.getTextWidth(slideNumText);
      pdf.text(
        slideNumText,
        pageWidth - margin - slideNumWidth,
        pageHeight - 10
      );
      pdf.setTextColor(0, 0, 0); // Reset to black

      // Process slide content
      const lines = slideContent.split("\n");
      let y = margin + 10; // Start a bit lower for title slides
      let isFirstLine = true;
      let hasTitle = false;

      // First pass: check if there's a title (H1)
      for (const line of lines) {
        if (line.trim().startsWith("# ") && !line.trim().startsWith("##")) {
          hasTitle = true;
          break;
        }
      }

      // If no title, center content vertically
      if (!hasTitle) {
        y = (pageHeight - contentHeight) / 2 + 20;
      }

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (!line) {
          if (!isFirstLine) y += 8;
          continue;
        }

        // Check if we need to wrap to next page (shouldn't happen for slides, but safety check)
        if (y > pageHeight - margin - 20) {
          break;
        }

        let fontSize = 12;
        let lineHeight = 8;
        let isBold = false;
        let indent = 0;

        // Handle headers
        if (line.startsWith("# ") && !line.trim().startsWith("##")) {
          // Main title (H1)
          fontSize = 36;
          lineHeight = 20;
          isBold = true;
          line = line.substring(2).trim();
          if (isFirstLine) {
            y = margin + 25; // Top of slide for title
          }
        } else if (line.startsWith("## ")) {
          // Section header (H2)
          fontSize = 28;
          lineHeight = 16;
          isBold = true;
          line = line.substring(3).trim();
          if (isFirstLine && !hasTitle) {
            y = margin + 20;
          } else {
            y += 12; // Extra space before section header
          }
        } else if (line.startsWith("### ")) {
          // Subsection (H3)
          fontSize = 20;
          lineHeight = 12;
          isBold = true;
          line = line.substring(4).trim();
          y += 8;
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          // Bullet point
          fontSize = 16;
          lineHeight = 10;
          indent = 8;
          line = "• " + line.substring(2).trim();
          if (isFirstLine) {
            y = margin + 30;
          }
        } else {
          // Regular text
          fontSize = 16;
          lineHeight = 10;
          if (isFirstLine && !hasTitle) {
            y = margin + 30;
          }
        }

        // Clean up markdown formatting
        const originalLine = line;
        line = line.replace(/\*\*(.*?)\*\*/g, "$1"); // Bold
        const hasBoldMarkers = originalLine !== line;
        line = line.replace(/\*(.*?)\*/g, "$1"); // Italic
        line = line.replace(/`(.*?)`/g, "$1"); // Code
        line = line.replace(/\[(\d+)\]/g, "[$1]"); // Citations

        // Set font
        pdf.setFontSize(fontSize);
        pdf.setFont("helvetica", isBold || hasBoldMarkers ? "bold" : "normal");

        // Split long lines
        const splitLines = pdf.splitTextToSize(line, contentWidth - indent);

        // Check if content fits on slide
        const neededHeight = splitLines.length * lineHeight;
        if (y + neededHeight > pageHeight - margin - 15) {
          // Content too long, truncate or use smaller font
          if (splitLines.length > 1) {
            // Try with smaller font
            pdf.setFontSize(fontSize * 0.85);
            const adjustedLines = pdf.splitTextToSize(
              line,
              contentWidth - indent
            );
            pdf.text(adjustedLines, margin + indent, y);
            y += adjustedLines.length * (lineHeight * 0.85);
          } else {
            pdf.text(splitLines, margin + indent, y);
            y += neededHeight;
          }
        } else {
          pdf.text(splitLines, margin + indent, y);
          y += neededHeight;
        }

        isFirstLine = false;
      }
    });

    // Save the PDF
    const filename = `${result.topic.replace(/\s+/g, "-")}-slides.pdf`;
    pdf.save(filename);
    console.log("✓ Downloaded slides as PDF");
  };

  const handleDownload = () => {
    const text = cleanMarkdownContent(
      result.formatted_brief || result.final_brief || ""
    );
    const pdf = new jsPDF();

    // Set up the PDF
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let y = margin;

    // Title
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    const title = result.topic;
    const titleLines = pdf.splitTextToSize(title, maxWidth);
    pdf.text(titleLines, margin, y);
    y += titleLines.length * 10 + 10;

    // Process the markdown text
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");

    const lines = text.split("\n");
    let inTable = false;
    let tableData: string[][] = [];
    let tableHeaders: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Detect table start/end
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());

        // Check if this is a separator line (|---|---|)
        if (cells.every((cell) => /^[-:]+$/.test(cell))) {
          continue; // Skip separator line
        }

        if (!inTable) {
          // First row is headers
          inTable = true;
          tableHeaders = cells;
        } else {
          // Data rows
          tableData.push(cells);
        }
        continue;
      } else if (inTable) {
        // End of table, render it
        autoTable(pdf, {
          head: [tableHeaders],
          body: tableData,
          startY: y,
          margin: { left: margin, right: margin },
          theme: "striped",
          headStyles: { fillColor: [71, 85, 105], fontStyle: "bold" },
          styles: { fontSize: 10 },
        });
        y = (pdf as any).lastAutoTable.finalY + 10;
        inTable = false;
        tableData = [];
        tableHeaders = [];
      }

      if (inTable) continue;

      // Check if we need a new page
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }

      // Handle headers
      if (line.startsWith("# ")) {
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        line = line.substring(2);
        y += 5;
      } else if (line.startsWith("## ")) {
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        line = line.substring(3);
        y += 4;
      } else if (line.startsWith("### ")) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        line = line.substring(4);
        y += 3;
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        line = "  • " + line.substring(2);
      } else if (line.match(/^\d+\. /)) {
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        // Keep numbered list as is
      } else if (line.trim().startsWith("**") && line.trim().endsWith("**")) {
        pdf.setFont("helvetica", "bold");
        line = line.trim().replace(/^\*\*/, "").replace(/\*\*$/, "");
      } else {
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
      }

      // Handle empty lines
      if (line.trim() === "") {
        y += 5;
        continue;
      }

      // Clean up markdown formatting
      line = line.replace(/\*\*(.*?)\*\*/g, "$1"); // Bold
      line = line.replace(/\*(.*?)\*/g, "$1"); // Italic
      line = line.replace(/`(.*?)`/g, "$1"); // Code

      // Split long lines
      const splitLines = pdf.splitTextToSize(line, maxWidth);

      // Check if we need a new page for the split lines
      if (y + splitLines.length * 6 > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }

      pdf.text(splitLines, margin, y);
      y += splitLines.length * 6;
    }

    // If we ended while still in a table, render it
    if (inTable && tableData.length > 0) {
      autoTable(pdf, {
        head: [tableHeaders],
        body: tableData,
        startY: y,
        margin: { left: margin, right: margin },
        theme: "striped",
        headStyles: { fillColor: [71, 85, 105], fontStyle: "bold" },
        styles: { fontSize: 10 },
      });
    }

    // Save the PDF
    const filename = `${result.topic.replace(/\s+/g, "-")}-brief.pdf`;
    pdf.save(filename);
    console.log("✓ Downloaded as PDF");
  };

  const tabs = [
    ...(result.slides
      ? [{ id: "slides" as Tab, label: "Slides", icon: Presentation }]
      : []),
    { id: "brief" as Tab, label: "Brief", icon: FileText },
    {
      id: "sources" as Tab,
      label: "Sources",
      icon: Database,
      count: result.sources?.length,
    },
    {
      id: "claims" as Tab,
      label: "Claims",
      icon: List,
      count: result.claims?.length,
    },
  ];

  return (
    <div className="card">
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-primary-50 text-primary-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="status-badge bg-slate-200 text-slate-700">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "slides" && result.slides && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">
              Presentation Slides
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="btn-secondary flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleDownloadSlides}
                className="btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>
          <div className="space-y-8">
            {(() => {
              // Clean and split slides by --- separator
              const cleanedSlides = cleanMarkdownContent(result.slides);
              const slideSections = cleanedSlides
                .split(/\n---\n|\n---$|^---\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

              return slideSections.map((slideContent, index) => (
                <div
                  key={index}
                  className="bg-white border-2 border-slate-200 rounded-lg shadow-sm overflow-hidden"
                >
                  {/* Slide container with aspect ratio */}
                  <div className="relative bg-gradient-to-br from-slate-50 to-white p-8 md:p-12 min-h-[400px] flex flex-col">
                    {/* Slide number badge */}
                    <div className="absolute top-4 right-4 bg-primary-100 text-primary-700 text-xs font-semibold px-3 py-1 rounded-full">
                      Slide {index + 1} / {slideSections.length}
                    </div>

                    {/* Slide content */}
                    <div className="flex-1 flex flex-col justify-center">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ node, ...props }) => (
                            <h1
                              className="text-4xl md:text-5xl font-bold mb-6 text-slate-900 leading-tight"
                              {...props}
                            />
                          ),
                          h2: ({ node, ...props }) => (
                            <h2
                              className="text-3xl md:text-4xl font-bold mb-5 text-slate-900 leading-tight"
                              {...props}
                            />
                          ),
                          h3: ({ node, ...props }) => (
                            <h3
                              className="text-2xl md:text-3xl font-semibold mb-4 text-slate-900 leading-tight"
                              {...props}
                            />
                          ),
                          h4: ({ node, ...props }) => (
                            <h4
                              className="text-xl md:text-2xl font-semibold mb-3 text-slate-900"
                              {...props}
                            />
                          ),
                          p: ({ node, ...props }) => (
                            <p
                              className="text-lg md:text-xl text-slate-700 mb-4 leading-relaxed"
                              {...props}
                            />
                          ),
                          ul: ({ node, ...props }) => (
                            <ul
                              className="list-disc pl-8 mb-4 space-y-3 text-lg md:text-xl text-slate-700"
                              {...props}
                            />
                          ),
                          ol: ({ node, ...props }) => (
                            <ol
                              className="list-decimal pl-8 mb-4 space-y-3 text-lg md:text-xl text-slate-700"
                              {...props}
                            />
                          ),
                          li: ({ node, ...props }) => (
                            <li
                              className="ml-2 text-slate-700 leading-relaxed"
                              {...props}
                            />
                          ),
                          strong: ({ node, ...props }) => (
                            <strong
                              className="font-bold text-slate-900"
                              {...props}
                            />
                          ),
                          code: ({ node, inline, ...props }: any) =>
                            inline ? (
                              <code
                                className="bg-slate-200 text-primary-700 px-2 py-1 rounded text-base font-mono"
                                {...props}
                              />
                            ) : (
                              <code
                                className="block bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono mb-4"
                                {...props}
                              />
                            ),
                          pre: ({ node, children, ...props }: any) => (
                            <pre
                              className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto mb-4"
                              {...props}
                            >
                              {children}
                            </pre>
                          ),
                          a: ({ node, ...props }) => (
                            <a
                              className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                              target="_blank"
                              rel="noopener noreferrer"
                              {...props}
                            />
                          ),
                          blockquote: ({ node, ...props }) => (
                            <blockquote
                              className="border-l-4 border-primary-500 pl-6 italic my-4 text-lg text-slate-600"
                              {...props}
                            />
                          ),
                        }}
                      >
                        {slideContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {activeTab === "brief" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Final Lecture Brief
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="btn-secondary flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                className="btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>
          <div className="prose prose-slate max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ node, ...props }) => (
                  <h1
                    className="text-3xl font-bold mt-8 mb-4 text-slate-900"
                    {...props}
                  />
                ),
                h2: ({ node, ...props }) => (
                  <h2
                    className="text-2xl font-semibold mt-6 mb-3 text-slate-900"
                    {...props}
                  />
                ),
                h3: ({ node, ...props }) => (
                  <h3
                    className="text-xl font-semibold mt-5 mb-2 text-slate-900"
                    {...props}
                  />
                ),
                h4: ({ node, ...props }) => (
                  <h4
                    className="text-lg font-semibold mt-4 mb-2 text-slate-900"
                    {...props}
                  />
                ),
                p: ({ node, ...props }) => (
                  <p
                    className="mb-4 text-slate-700 leading-relaxed"
                    {...props}
                  />
                ),
                ul: ({ node, ...props }) => (
                  <ul
                    className="list-disc pl-6 mb-4 space-y-2 text-slate-700"
                    {...props}
                  />
                ),
                ol: ({ node, ...props }) => (
                  <ol
                    className="list-decimal pl-6 mb-4 space-y-2 text-slate-700"
                    {...props}
                  />
                ),
                li: ({ node, ...props }) => (
                  <li className="ml-2 text-slate-700" {...props} />
                ),
                strong: ({ node, ...props }) => (
                  <strong className="font-semibold text-slate-900" {...props} />
                ),
                code: ({ node, inline, ...props }: any) =>
                  inline ? (
                    <code
                      className="bg-slate-100 text-primary-700 px-1.5 py-0.5 rounded text-sm font-mono"
                      {...props}
                    />
                  ) : (
                    <code
                      className="block bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono mb-4"
                      {...props}
                    />
                  ),
                pre: ({ node, children, ...props }: any) => (
                  <pre
                    className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto mb-4"
                    {...props}
                  >
                    {children}
                  </pre>
                ),
                a: ({ node, ...props }) => (
                  <a
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-4 border-primary-500 pl-4 italic my-4 text-slate-600"
                    {...props}
                  />
                ),
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-6">
                    <table
                      className="min-w-full border-collapse border border-slate-300"
                      {...props}
                    />
                  </div>
                ),
                thead: ({ node, ...props }) => (
                  <thead className="bg-slate-100" {...props} />
                ),
                tbody: ({ node, ...props }) => <tbody {...props} />,
                tr: ({ node, ...props }) => (
                  <tr className="border-b border-slate-300" {...props} />
                ),
                th: ({ node, ...props }) => (
                  <th
                    className="border border-slate-300 bg-slate-100 p-3 font-semibold text-left text-slate-900"
                    {...props}
                  />
                ),
                td: ({ node, ...props }) => (
                  <td
                    className="border border-slate-300 p-3 text-slate-700"
                    {...props}
                  />
                ),
                hr: ({ node, ...props }) => (
                  <hr className="border-slate-300 my-6" {...props} />
                ),
              }}
            >
              {cleanMarkdownContent(
                result.formatted_brief ||
                  result.final_brief ||
                  "No brief available"
              )}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {activeTab === "sources" && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Prioritized Sources
          </h3>
          {result.sources && result.sources.length > 0 ? (
            <div className="space-y-4">
              {result.sources.map((source, i) => (
                <div
                  key={i}
                  className="bg-slate-50 p-4 rounded-lg border border-slate-200"
                >
                  <h4 className="font-semibold text-slate-900 mb-2">
                    {source.title}
                  </h4>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 text-sm break-all"
                  >
                    {source.url}
                  </a>
                  <p className="text-slate-600 text-sm mt-2">
                    {source.snippet}
                  </p>
                  {source.query && (
                    <p className="text-slate-500 text-xs mt-2">
                      Query: {source.query}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">No sources available</p>
          )}
        </div>
      )}

      {activeTab === "claims" && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Extracted Claims
          </h3>
          {result.claims && result.claims.length > 0 ? (
            <div className="space-y-3">
              {result.claims.map((claim) => (
                <div
                  key={claim.id}
                  className="bg-slate-50 p-4 rounded-lg border border-slate-200"
                >
                  <p className="text-slate-900">
                    <span className="font-semibold text-primary-600">
                      [{claim.id}]
                    </span>{" "}
                    {claim.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">No claims available</p>
          )}
        </div>
      )}
    </div>
  );
}
