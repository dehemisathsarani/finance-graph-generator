import { useRef, useState } from "react";
import logo from "./assets/learn-logo.jpeg";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const steps = [
  { title: "Upload File", detail: "Upload your Excel file", icon: "upload" },
  { title: "Select Graph", detail: "Choose a graph title", icon: "clipboard" },
  { title: "Generate", detail: "Generate your graph", icon: "chart" },
  { title: "Download", detail: "Download PNG / PDF", icon: "download" },
];

const Icon = ({ name, className = "h-6 w-6" }) => {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  const paths = {
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M20 16.5a4.5 4.5 0 0 1-3.8 4.45H8a5 5 0 0 1-.9-9.9A6 6 0 0 1 18.7 9" />
      </>
    ),
    clipboard: (
      <>
        <path d="M9 5h6" />
        <path d="M9 3h6v4H9z" />
        <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </>
    ),
    chart: (
      <>
        <path d="M5 20V10" />
        <path d="M12 20V4" />
        <path d="M19 20v-7" />
        <path d="M3 20h18" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    check: (
      <>
        <path d="M20 6 9 17l-5-5" />
      </>
    ),
    expand: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 15H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    ),
    moon: (
      <>
        <path d="M20 15.5A7.5 7.5 0 0 1 8.5 4 8 8 0 1 0 20 15.5z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
};

function formatBytes(bytes) {
  if (!bytes) {
    return "";
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function readApiError(response) {
  try {
    const body = await response.json();
    return body.detail || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

function App() {
  const fileInputRef = useRef(null);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [graphResult, setGraphResult] = useState(null);
  const [allGraphsUrl, setAllGraphsUrl] = useState("");
  const [status, setStatus] = useState("Waiting for Excel file");
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const canGenerate = uploadInfo && selectedTitle && !isGenerating;
  const previewUrl = graphResult?.pngUrl ? `${API_BASE}${graphResult.pngUrl}` : "";

  const uploadFile = async (file) => {
    if (!file) {
      return;
    }

    // Validate file type
    const validExtensions = [".xlsx", ".xls"];
    const fileExtension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      setError(`Invalid file type. Please upload an Excel file (.xlsx or .xls). Got: ${fileExtension}`);
      setStatus("Upload failed");
      return;
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File is too large. Maximum size is ${maxSize / 1024 / 1024}MB. Got: ${formatBytes(file.size)}`);
      setStatus("Upload failed");
      return;
    }

    if (file.size === 0) {
      setError("File is empty. Please select a valid Excel file.");
      setStatus("Upload failed");
      return;
    }

    setError("");
    setStatus("Uploading file");
    setIsUploading(true);
    setGraphResult(null);
    setAllGraphsUrl("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorMsg = await readApiError(response);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setUploadInfo({
        ...data,
        localName: file.name,
        localSize: file.size,
      });
      setSelectedTitle(data.titles[0]?.title || "");
      setSelectedSheet(data.titles[0]?.sheet || "");
      setStatus("File ready");
    } catch (err) {
      setUploadInfo(null);
      setSelectedTitle("");
      setSelectedSheet("");
      setStatus("Upload failed");
      setError(err.message || "Failed to upload file");
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const generateGraph = async () => {
    if (!canGenerate) {
      return;
    }

    setError("");
    setStatus("Generating graph");
    setIsGenerating(true);
    setGraphResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: uploadInfo.fileId,
          title: selectedTitle,
          sheet: selectedSheet,
        }),
      });

      if (!response.ok) {
        const errorMsg = await readApiError(response);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setGraphResult(data);
      setStatus("Graph ready");
    } catch (err) {
      setStatus("Generation failed");
      setError(err.message || "Failed to generate graph");
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAllGraphs = async () => {
    if (!uploadInfo || isGeneratingAll) {
      return;
    }

    setError("");
    setStatus("Generating all graphs");
    setIsGeneratingAll(true);

    try {
      const response = await fetch(`${API_BASE}/api/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: uploadInfo.fileId }),
      });

      if (!response.ok) {
        const errorMsg = await readApiError(response);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setAllGraphsUrl(`${API_BASE}${data.zipUrl}`);
      setStatus(`${data.count} graphs ready`);
    } catch (err) {
      setStatus("Generate all failed");
      setError(err.message || "Failed to generate all graphs");
      console.error("Batch generation error:", err);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const clearAll = () => {
    setUploadInfo(null);
    setSelectedTitle("");
    setSelectedSheet("");
    setGraphResult(null);
    setAllGraphsUrl("");
    setStatus("Waiting for Excel file");
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadLabel = isUploading ? "Uploading..." : "Click to upload or drag and drop";

  return (
    <main className="min-h-screen bg-[#eef8ff] text-[#080a59]">
      <header className="fixed left-0 right-0 top-0 z-30 flex h-[92px] items-center border-b border-[#cfe0ef] bg-white/90 px-6 shadow-[0_10px_35px_rgba(7,25,120,0.06)] backdrop-blur">
        <div className="flex min-w-[250px] items-center gap-5">
          <img src={logo} alt="LEARN" className="h-16 w-[186px] rounded-sm object-contain" />
        </div>
        <h1 className="text-[clamp(1.2rem,2vw,1.75rem)] font-black tracking-[0]">
          Finance Graphs Generator
        </h1>
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-[#cfdbed] bg-[#f7fbff] px-3 py-2 shadow-sm sm:flex">
            <Icon name="sun" className="h-5 w-5 text-[#061477]" />
            <Icon name="moon" className="h-5 w-5 text-[#8c98b8]" />
          </div>
          <div className="hidden h-10 w-px bg-[#d6e2ef] sm:block" />
          <button className="flex items-center gap-3 rounded-md px-3 py-2 font-bold text-[#080a59]">
            <Icon name="users" className="h-6 w-6 text-[#5614ff]" />
            <span className="hidden sm:inline">Finance Team</span>
            <span className="text-lg leading-none">v</span>
          </button>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-[92px] hidden w-[252px] overflow-hidden bg-gradient-to-b from-[#55c2f2] to-[#0063b9] px-4 py-8 text-white shadow-[12px_0_35px_rgba(0,76,145,0.18)] lg:block">
        <nav className="space-y-4">
          <a className="flex items-center gap-5 rounded-lg bg-gradient-to-r from-[#218bea] to-[#0751bc] px-5 py-4 text-lg font-bold shadow-xl shadow-blue-900/20" href="/">
            <Icon name="grid" className="h-7 w-7" />
            Dashboard
          </a>
        </nav>

        <div className="absolute bottom-28 left-0 right-0 px-4">
          <div className="relative mx-auto h-64 max-w-[220px]">
            <div className="absolute bottom-0 left-4 h-12 w-9 bg-gradient-to-t from-[#7ed8ff] to-white/90 shadow-lg" />
            <div className="absolute bottom-0 left-16 h-20 w-9 bg-gradient-to-t from-[#7ed8ff] to-white/90 shadow-lg" />
            <div className="absolute bottom-0 left-28 h-28 w-9 bg-gradient-to-t from-[#7ed8ff] to-white/90 shadow-lg" />
            <div className="absolute bottom-0 left-40 h-36 w-9 bg-gradient-to-t from-[#7ed8ff] to-white/90 shadow-lg" />
            <div className="absolute bottom-7 left-2 h-px w-48 rotate-[-28deg] bg-white/70" />
            <div className="absolute bottom-16 left-8 h-px w-36 rotate-[-48deg] bg-white/70" />
            <div className="absolute bottom-14 left-8 h-3 w-3 rounded-full bg-[#b8efff] shadow-[0_0_18px_white]" />
            <div className="absolute bottom-[6.25rem] left-16 h-3 w-3 rounded-full bg-[#b8efff] shadow-[0_0_18px_white]" />
            <div className="absolute bottom-32 left-28 h-3 w-3 rounded-full bg-[#b8efff] shadow-[0_0_18px_white]" />
            <div className="absolute bottom-44 left-40 h-3 w-3 rounded-full bg-[#b8efff] shadow-[0_0_18px_white]" />
            <div className="absolute bottom-[-10px] left-0 h-10 w-full rounded-[50%] bg-[#6dc7ff]/40 blur-sm" />
          </div>
        </div>

        <footer className="absolute bottom-6 left-4 right-4 text-sm font-medium leading-8">
          <p>(c) 2026 Finance Graph Generator</p>
          <p>All rights reserved.</p>
        </footer>
      </aside>

      <section className="px-4 pb-8 pt-[116px] lg:ml-[252px] lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-6">
            <h2 className="text-3xl font-black tracking-[0]">Dashboard</h2>
            <p className="mt-2 text-base font-medium text-[#111368]">
              Upload your Excel file, select a graph and generate instantly.
            </p>
          </div>

          <div className="relative mb-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="pointer-events-none absolute left-8 right-8 top-1/2 hidden border-t-2 border-dashed border-[#5d32f8] xl:block" />
            {steps.map((step, index) => (
              <article
                className="relative z-10 flex items-center gap-4 rounded-lg border border-[#d0deee] bg-white/88 p-5 shadow-[0_12px_30px_rgba(7,25,120,0.08)]"
                key={step.title}
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#083197] to-[#7117ff] text-white shadow-lg shadow-blue-900/20">
                  <Icon name={step.icon} className="h-8 w-8" />
                </div>
                <div>
                  <p className="font-black">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-2 font-medium text-[#111368]">{step.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[365px_minmax(0,1fr)]">
            <section className="rounded-lg border border-[#cfdeef] bg-white/82 p-5 shadow-[0_18px_45px_rgba(7,25,120,0.08)]">
              <h3 className="mb-5 text-lg font-black">1. Upload Excel File</h3>
              <input
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => uploadFile(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="grid min-h-[150px] w-full place-items-center rounded-lg border border-dashed border-[#681cff] bg-white/60 p-5 text-center transition hover:bg-[#f7f3ff] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  uploadFile(event.dataTransfer.files?.[0]);
                }}
              >
                <span className="grid place-items-center gap-3">
                  <Icon name="upload" className="h-12 w-12 text-[#6412e8]" />
                  <span className="font-black">{uploadLabel}</span>
                  <span className="text-sm font-medium text-[#111368]">Excel files only (.xlsx, .xls)</span>
                </span>
              </button>

              {uploadInfo ? (
                <div className="mt-4 flex items-center gap-4 rounded-lg border border-[#cfdeef] bg-white p-4 shadow-sm">
                  <div className="grid h-12 w-10 place-items-center rounded bg-[#1f9d55] text-xl font-black text-white">
                    X
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">
                      {uploadInfo.filename || uploadInfo.localName}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[#111368]">
                      {formatBytes(uploadInfo.size || uploadInfo.localSize)}
                    </p>
                  </div>
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#13a348] text-white">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-[#cfdeef] bg-white/70 p-4 text-sm font-bold text-[#111368]">
                  No file uploaded yet.
                </div>
              )}

              <h3 className="mb-3 mt-7 text-lg font-black">2. Select Graph Title</h3>
              <p className="mb-3 text-sm font-medium text-[#111368]">
                {uploadInfo ? `Found ${uploadInfo.titles.length} graph titles in this file` : "Upload a file to load graph titles"}
              </p>
              <select
                className="min-h-12 w-full rounded-lg border border-[#cfdeef] bg-white p-4 text-sm font-black shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!uploadInfo}
                onChange={(event) => {
                  const item = uploadInfo?.titles[Number(event.target.value)];
                  setSelectedTitle(item?.title || "");
                  setSelectedSheet(item?.sheet || "");
                  setGraphResult(null);
                }}
                value={Math.max(
                  uploadInfo?.titles.findIndex(
                    (item) => item.title === selectedTitle && item.sheet === selectedSheet,
                  ) ?? -1,
                  0,
                )}
              >
                {!uploadInfo ? <option>Select a title after upload</option> : null}
                {uploadInfo?.titles.map((item, index) => (
                  <option key={`${item.sheet}-${item.row}-${item.title}`} value={index}>
                    {item.title}
                    {item.sheet ? ` (${item.sheet})` : ""}
                  </option>
                ))}
              </select>

              <div className={`mt-5 rounded-lg border p-4 text-sm ${error ? "border-[#ffb6bd] bg-[#fff5f6] text-[#b00020]" : "border-[#d7d7ff] bg-[#f2f0ff] text-[#111368]"}`}>
                <p className="font-black">{error || status}</p>
                <p className="mt-2 text-xs font-medium">
                  {uploadInfo
                    ? "Generate one selected graph or create a ZIP file with every graph title."
                    : "The Excel workbook must contain a sheet named Graph."}
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0875d8] to-[#0748b4] px-4 font-black text-white shadow-lg shadow-blue-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canGenerate}
                  onClick={generateGraph}
                >
                  <Icon name="download" className="h-5 w-5 rotate-180" />
                  {isGenerating ? "Generating..." : "Generate Graph"}
                </button>
                <button
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#9b78ff] bg-white px-4 font-black text-[#4c13e8] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!uploadInfo || isGeneratingAll}
                  onClick={generateAllGraphs}
                >
                  <Icon name="grid" className="h-5 w-5" />
                  {isGeneratingAll ? "Generating..." : "Generate All"}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-[#cfdeef] bg-white/82 p-5 shadow-[0_18px_45px_rgba(7,25,120,0.08)]">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h3 className="mr-auto text-lg font-black">Graph Preview</h3>
                <span className="flex items-center gap-2 rounded-full bg-[#e5f8ea] px-4 py-2 text-sm font-black text-[#0d7a33]">
                  <Icon name="check" className="h-4 w-4" />
                  {status}
                </span>
                <button
                  className="flex items-center gap-2 rounded-lg border border-[#d7e1ee] bg-white px-4 py-2 text-sm font-black shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!previewUrl}
                  onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                >
                  <Icon name="expand" className="h-5 w-5" />
                  Fullscreen
                </button>
              </div>

              <div className="grid min-h-[520px] place-items-center overflow-hidden rounded-lg border border-[#cfdeef] bg-white p-4">
                {previewUrl ? (
                  <img
                    alt={graphResult.title}
                    className="max-h-[720px] w-full rounded-md object-contain"
                    src={previewUrl}
                  />
                ) : (
                  <div className="grid place-items-center gap-4 text-center">
                    <div className="grid h-20 w-20 place-items-center rounded-lg bg-[#eef3ff] text-[#5614ff]">
                      <Icon name="chart" className="h-10 w-10" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black">No graph generated yet</h4>
                      <p className="mt-2 max-w-md text-sm font-medium text-[#111368]">
                        Upload the Excel file, select a graph title, then click Generate Graph.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <a
              className={`mx-auto flex min-h-12 min-w-[190px] items-center justify-center gap-3 rounded-lg border border-[#426bff] bg-white px-6 font-black text-[#0b28ff] shadow-sm ${graphResult ? "" : "pointer-events-none opacity-50"}`}
              href={graphResult ? `${API_BASE}${graphResult.pngUrl}` : "#"}
            >
              <Icon name="file" className="h-5 w-5" />
              Download PNG
            </a>
            <a
              className={`mx-auto flex min-h-12 min-w-[190px] items-center justify-center gap-3 rounded-lg border border-[#a47aff] bg-white px-6 font-black text-[#4d13ff] shadow-sm xl:mx-0 ${graphResult ? "" : "pointer-events-none opacity-50"}`}
              href={graphResult ? `${API_BASE}${graphResult.pdfUrl}` : "#"}
            >
              <Icon name="file" className="h-5 w-5 text-[#ff174b]" />
              Download PDF
            </a>
            <a
              className={`flex min-h-12 min-w-[190px] items-center justify-center gap-3 rounded-lg border border-[#13a348] bg-white px-6 font-black text-[#0d7a33] shadow-sm ${allGraphsUrl ? "" : "pointer-events-none opacity-50"}`}
              href={allGraphsUrl || "#"}
            >
              <Icon name="download" className="h-5 w-5" />
              Download All
            </a>
            <button
              className="ml-auto flex min-h-12 min-w-[160px] items-center justify-center gap-3 rounded-lg border border-[#ffb6bd] bg-white px-6 font-black text-[#ff1c25] shadow-sm"
              onClick={clearAll}
            >
              <Icon name="trash" className="h-5 w-5" />
              Clear
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
