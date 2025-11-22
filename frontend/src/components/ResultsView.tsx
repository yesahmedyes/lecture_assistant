import { useState } from "react";
import {
  FileText,
  Database,
  List,
  BarChart3,
  Download,
  Copy,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";
import type { SessionResult } from "../types";

interface Props {
  sessionId: string;
  result: SessionResult;
}

type Tab = "brief" | "sources" | "claims";

export default function ResultsView({ sessionId, result }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("brief");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = result.formatted_brief || result.final_brief || "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    console.log("✓ Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = result.formatted_brief || result.final_brief || "";
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

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

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

    // Save the PDF
    const filename = `${result.topic.replace(/\s+/g, "-")}-brief.pdf`;
    pdf.save(filename);
    console.log("✓ Downloaded as PDF");
  };

  const tabs = [
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
            <ReactMarkdown>
              {result.formatted_brief ||
                result.final_brief ||
                "No brief available"}
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
                  {claim.citations && claim.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {claim.citations.map((cite, i) => (
                        <span
                          key={i}
                          className="status-badge bg-blue-50 text-blue-700 text-xs"
                        >
                          {cite}
                        </span>
                      ))}
                    </div>
                  )}
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
