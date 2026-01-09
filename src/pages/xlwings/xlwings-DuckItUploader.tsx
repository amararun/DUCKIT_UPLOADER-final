import { Database, Download, ExternalLink, FileSpreadsheet, Link2, Layers, Package } from 'lucide-react';

const DuckItUploader = () => {
  return (
    <div className="w-full px-4 py-6 bg-slate-100 min-h-screen">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <h1 className="text-3xl font-bold text-black">
          DuckDB & Parquet Files in Excel via xlwings
        </h1>
        <p className="text-lg text-black max-w-3xl">
          Get shareable links for DuckDB/Parquet files using DuckIt, then load them directly into Excel with xlwings Lite.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-wrap items-center gap-4">
        <a
          href="https://duckit.tigzig.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-2 text-sm rounded-md text-black border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
        >
          <Database size={16} className="text-black" />
          <span>Open DuckIt App</span>
          <ExternalLink size={16} className="text-black" />
        </a>

        <a
          href="#"
          className="inline-flex items-center gap-2 px-6 py-2 text-sm rounded-md text-black border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
        >
          <Download size={16} className="text-black" />
          <span>Download Excel App</span>
        </a>
      </div>

      {/* Card Grid - Top Row */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* What It Does Card */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="border-t border-slate-200"></div>
          <div className="p-6 pb-2 mb-4">
            <h2 className="text-black text-xl font-semibold">What This Does</h2>
          </div>
          <div className="px-6 pb-6">
            <p className="mb-3 text-base text-black leading-relaxed">
              Two-part workflow to get DuckDB/Parquet data into Excel:
            </p>
            <ul className="space-y-1 list-disc pl-5 text-base text-black leading-relaxed">
              <li><span className="font-semibold">DuckIt App:</span> Upload CSV/TSV files and convert to DuckDB or Parquet format</li>
              <li><span className="font-semibold">DuckIt App:</span> Get a shareable download link (24h temp or 7-day persistent)</li>
              <li><span className="font-semibold">DuckIt App:</span> Direct upload of existing Parquet/DuckDB files</li>
              <li><span className="font-semibold">Excel App:</span> Paste the link and load data directly into Excel</li>
              <li><span className="font-semibold">Excel App:</span> Supports GitHub, Dropbox, Google Drive, and other hosted links</li>
            </ul>
            <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
              <h4 className="text-sm font-bold text-black">Note</h4>
              <p className="text-sm text-black mt-2">
                DuckIt handles file conversion and hosting. The Excel app handles data loading from any URL source.
              </p>
            </div>
          </div>
        </div>

        {/* How to Use Card */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="border-t border-slate-200"></div>
          <div className="p-6 pb-2 mb-4">
            <h2 className="text-black text-xl font-semibold">How to Use</h2>
          </div>
          <div className="px-6 pb-6">
            <ol className="space-y-2 list-decimal pl-5 text-base text-black leading-relaxed">
              <li>
                <span className="font-semibold text-black">Get a Shareable Link (DuckIt App)</span>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-base text-black leading-relaxed">
                  <li>Go to <a href="https://duckit.tigzig.com" target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">duckit.tigzig.com</a></li>
                  <li>Option A: Drop CSV/TSV files to build a DuckDB database</li>
                  <li>Option B: Drop existing Parquet/DuckDB files for direct upload</li>
                  <li>Option C: Convert CSV to Parquet format in browser</li>
                  <li>Click "Get Shareable Link" and copy the URL</li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-black">Load in Excel (Excel App)</span>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-base text-black leading-relaxed">
                  <li>Download the Excel app and install xlwings Lite</li>
                  <li>Paste the DuckIt URL (or any supported URL)</li>
                  <li>Run the load function to pull data into Excel</li>
                </ul>
              </li>
            </ol>
            <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
              <h4 className="text-sm font-bold text-black">Alternative Sources</h4>
              <p className="text-sm text-black mt-2">
                Already have files hosted elsewhere? The Excel app also supports GitHub raw links, Dropbox, Google Drive, and other direct download URLs.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Card Grid - Middle Row */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* How It Works Card */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="border-t border-slate-200"></div>
          <div className="p-6 pb-2 mb-4">
            <h2 className="text-black text-xl font-semibold">How It Works</h2>
          </div>
          <div className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex flex-col space-y-1">
                <p className="font-semibold text-base text-black">DuckIt App (This Repo)</p>
                <ul className="list-disc pl-5 text-base text-black leading-relaxed space-y-1">
                  <li>Browser-based DuckDB-WASM for in-browser processing</li>
                  <li>CSV/TSV to Parquet conversion without server upload</li>
                  <li>Token-based upload to FastAPI backend</li>
                  <li>Signed URLs for secure, expiring download links</li>
                  <li>No file size limits for browser conversion (up to ~1.5GB)</li>
                </ul>
              </div>

              <div className="flex flex-col space-y-1">
                <p className="font-semibold text-base text-black">Excel App (Separate Repo)</p>
                <ul className="list-disc pl-5 text-base text-black leading-relaxed space-y-1">
                  <li>xlwings Lite for Python-Excel integration</li>
                  <li>DuckDB Python package for Parquet/DuckDB file reading</li>
                  <li>URL fetching and data extraction</li>
                  <li>Supports multiple URL formats (GitHub, Dropbox, etc.)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Source Code & Resources Card */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="border-t border-slate-200"></div>
          <div className="p-6 pb-2 mb-4">
            <h2 className="text-black text-xl font-semibold">Source Code & Resources</h2>
          </div>
          <div className="px-6 pb-6">
            <div className="grid grid-cols-1 gap-4">
              <a
                href="https://github.com/amararun/shared-DUCKIT_UPLOADER"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-4 border rounded-md bg-white hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Database size={16} className="text-teal-700" />
                  <h3 className="font-medium text-black text-lg">DuckIt Frontend</h3>
                </div>
                <p className="text-base text-black">
                  React + Vite frontend for file upload and conversion
                </p>
              </a>

              <a
                href="https://github.com/amararun/shared-FASTAPI_DUCKIT"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-4 border rounded-md bg-white hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileSpreadsheet size={16} className="text-teal-700" />
                  <h3 className="font-medium text-black text-lg">DuckIt Backend</h3>
                </div>
                <p className="text-base text-black">
                  FastAPI backend for file storage and signed URL generation
                </p>
              </a>

              <a
                href="https://lite.xlwings.org"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-4 border rounded-md bg-white hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers size={16} className="text-teal-700" />
                  <h3 className="font-medium text-black text-lg">xlwings Lite</h3>
                </div>
                <p className="text-base text-black">
                  Official website with installation instructions
                </p>
              </a>

              <a
                href="https://docs.xlwings.org/en/latest/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col p-4 border rounded-md bg-white hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Package size={16} className="text-teal-700" />
                  <h3 className="font-medium text-black text-lg">xlwings Documentation</h3>
                </div>
                <p className="text-base text-black">
                  Full documentation and API reference
                </p>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Flow Diagram */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="border-t border-slate-200"></div>
          <div className="p-6 pb-2 mb-4">
            <h2 className="text-black text-xl font-semibold">Architecture Flow</h2>
          </div>
          <div className="px-6 pb-6">
            <div className="overflow-x-auto">
              <svg viewBox="0 0 900 180" className="w-full h-auto min-w-[600px]">
                {/* Background */}
                <rect width="900" height="180" fill="#f8fafc" rx="8" />

                {/* CSV/Parquet Files Box */}
                <g>
                  <rect x="20" y="60" width="120" height="60" rx="6" fill="#1e293b" />
                  <text x="80" y="85" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="system-ui, sans-serif">CSV/Parquet</text>
                  <text x="80" y="105" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui, sans-serif">Source Files</text>
                </g>

                {/* Arrow 1 */}
                <path d="M145 90 L185 90" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead2)" />

                {/* DuckIt App Box */}
                <g>
                  <rect x="190" y="60" width="130" height="60" rx="6" fill="#DC2626" />
                  <text x="255" y="85" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="system-ui, sans-serif">DuckIt App</text>
                  <text x="255" y="105" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui, sans-serif">Convert & Upload</text>
                </g>

                {/* Arrow 2 */}
                <path d="M325 90 L365 90" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead2)" />

                {/* Backend Box */}
                <g>
                  <rect x="370" y="60" width="130" height="60" rx="6" fill="#0F766E" />
                  <text x="435" y="85" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="system-ui, sans-serif">FastAPI</text>
                  <text x="435" y="105" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui, sans-serif">Signed URLs</text>
                </g>

                {/* Arrow 3 */}
                <path d="M505 90 L545 90" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead2)" />

                {/* Shareable Link Box */}
                <g>
                  <rect x="550" y="60" width="130" height="60" rx="6" fill="#7c3aed" />
                  <text x="615" y="85" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="system-ui, sans-serif">Shareable Link</text>
                  <text x="615" y="105" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui, sans-serif">24h or 7-day</text>
                </g>

                {/* Arrow 4 */}
                <path d="M685 90 L725 90" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead2)" />

                {/* Excel Box */}
                <g>
                  <rect x="730" y="60" width="140" height="60" rx="6" fill="#0369a1" />
                  <text x="800" y="85" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="system-ui, sans-serif">Excel + xlwings</text>
                  <text x="800" y="105" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui, sans-serif">Load Data</text>
                </g>

                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead2" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                  </marker>
                </defs>
              </svg>
            </div>
            <p className="text-base text-black mt-3 text-center">
              Files are converted/uploaded via DuckIt, stored on backend with signed URLs, then loaded into Excel via xlwings
            </p>
          </div>
        </div>
      </div>

      {/* Credits Section */}
      <div className="max-w-7xl mx-auto">
        <div className="p-4 bg-white rounded-lg border border-slate-200">
          <div className="flex items-center gap-3">
            <Link2 size={40} className="text-teal-700" />
            <div>
              <h3 className="text-base font-medium text-black">Built with xlwings Lite</h3>
              <p className="text-base text-black leading-relaxed mt-1">
                Created by <a href="https://www.linkedin.com/in/felix-zumstein/" target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">Felix Zumstein</a> - Python-Excel integration for databases, AI, ML, APIs, and automation workflows.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuckItUploader;
