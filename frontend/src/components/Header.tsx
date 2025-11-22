import { GraduationCap, Github } from "lucide-react";
import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-2 rounded-lg group-hover:scale-105 transition-transform">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Lecture Assistant
              </h1>
              <p className="text-xs text-slate-500">
                AI-Powered Research Dashboard
              </p>
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
