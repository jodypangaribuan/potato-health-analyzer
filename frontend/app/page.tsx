"use client";

import { useState, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import * as UTIF from "utif2";

interface FileInputState {
  file: File | null;
  preview: string | null;
}

interface UploadState {
  original: FileInputState;
  nir: FileInputState;
  red: FileInputState;
  red_edge: FileInputState;
}

const initialUploadState: UploadState = {
  original: { file: null, preview: null },
  nir: { file: null, preview: null },
  red: { file: null, preview: null },
  red_edge: { file: null, preview: null },
};

const FIELD_LABELS: Record<keyof UploadState, string> = {
  original: "Citra Asli (RGB)",
  nir: "Band NIR",
  red: "Band Red",
  red_edge: "Band Red Edge",
};

// Function to create preview from TIF file
const createTifPreview = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const ifds = UTIF.decode(buffer);
        if (ifds.length === 0) {
          reject(new Error("No image data found"));
          return;
        }

        UTIF.decodeImage(buffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);

        const canvas = document.createElement("canvas");
        canvas.width = ifds[0].width;
        canvas.height = ifds[0].height;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          const imageData = ctx.createImageData(canvas.width, canvas.height);
          imageData.data.set(rgba);
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } else {
          reject(new Error("Could not create canvas context"));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
};

export default function HomePage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadState>(initialUploadState);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [loadingField, setLoadingField] = useState<string | null>(null);

  const processFile = async (field: keyof UploadState, file: File) => {
    setLoadingField(field);
    try {
      let preview: string;
      const isTif = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');

      if (isTif) {
        // Use UTIF to decode TIF files
        preview = await createTifPreview(file);
      } else {
        // Regular images
        preview = URL.createObjectURL(file);
      }

      setUploads((prev) => ({
        ...prev,
        [field]: { file, preview },
      }));
    } catch (err) {
      console.error("Error processing file:", err);
      // Fallback: just store the file without preview
      setUploads((prev) => ({
        ...prev,
        [field]: { file, preview: null },
      }));
    } finally {
      setLoadingField(null);
    }
  };

  const handleFileChange = (
    field: keyof UploadState,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      processFile(field, file);
    }
  };

  const handleDrop = (field: keyof UploadState, e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0] || null;
    if (file) {
      processFile(field, file);
    }
  };

  const handleDragOver = (field: string, e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(field);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const allFilesSelected = Object.values(uploads).every((u) => u.file !== null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allFilesSelected) return;

    setIsProcessing(true);
    setError(null);
    setProgress(0);

    const stages = [
      "Mengunggah file...",
      "Menghitung NDVI...",
      "Menganalisis NDRE...",
      "Klasifikasi zona sehat / sakit...",
      "Membuat overlay hasil...",
    ];

    // Simulate progress
    let currentStage = 0;
    const progressInterval = setInterval(() => {
      if (currentStage < stages.length) {
        setProgressText(stages[currentStage]);
        setProgress(((currentStage + 1) / stages.length) * 80);
        currentStage++;
      }
    }, 1200);

    try {
      const formData = new FormData();
      formData.append("original", uploads.original.file!);
      formData.append("nir", uploads.nir.file!);
      formData.append("red", uploads.red.file!);
      formData.append("red_edge", uploads.red_edge.file!);

      const response = await fetch("http://localhost:22555/api/analyze", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Terjadi kesalahan saat memproses");
      }

      const result = await response.json();

      setProgress(100);
      setProgressText("Proses selesai! Mengarahkan ke hasil...");

      // Store result in sessionStorage
      sessionStorage.setItem("analysisResult", JSON.stringify(result));

      // Navigate to results page
      setTimeout(() => {
        router.push("/results");
      }, 500);

    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setIsProcessing(false);
      setProgress(0);
      setProgressText("");
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-green-800 mb-2">
            Klasifikasi Kesehatan Tanaman
          </h1>
          <p className="text-green-600 text-lg">
            Sistem Analisis NDRE untuk Deteksi Kesehatan Tanaman Kentang
          </p>
        </div>

        {/* Main Card */}
        <div className="glass-card p-6 md:p-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {/* Progress Section */}
          {isProcessing && (
            <div className="mb-8 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-700">{progressText}</span>
                <span className="text-sm font-bold text-green-600">{Math.round(progress)}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 animate-fade-in">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Upload Form */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {(Object.keys(FIELD_LABELS) as Array<keyof UploadState>).map((field) => (
                <div
                  key={field}
                  className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ${dragOver === field
                    ? "border-green-500 bg-green-100/50 scale-[1.02]"
                    : uploads[field].file
                      ? "border-green-500 bg-green-50 p-0"
                      : "border-green-300 hover:border-green-500 hover:bg-green-50/50"
                    }`}
                  style={{ minHeight: uploads[field].file ? "200px" : "180px" }}
                  onDrop={(e) => handleDrop(field, e)}
                  onDragOver={(e) => handleDragOver(field, e)}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    type="file"
                    accept=".tif,.tiff,.png,.jpg,.jpeg"
                    onChange={(e) => handleFileChange(field, e)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isProcessing}
                  />

                  {/* Loading State */}
                  {loadingField === field && (
                    <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center z-20">
                      <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-3" />
                      <span className="text-sm text-green-600 font-medium">Memuat gambar...</span>
                    </div>
                  )}

                  {uploads[field].file ? (
                    /* Full Image Preview */
                    <div className="relative w-full h-full" style={{ minHeight: "200px" }}>
                      {uploads[field].preview ? (
                        /* Image Preview Available */
                        <>
                          <img
                            src={uploads[field].preview}
                            alt={FIELD_LABELS[field]}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {/* Overlay with label */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-white font-semibold">{FIELD_LABELS[field]}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Fallback if preview failed */
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
                          <div className="w-16 h-16 bg-green-200 rounded-xl flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-700 font-semibold">{FIELD_LABELS[field]}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Empty State */
                    <div className="flex flex-col items-center justify-center h-full py-10">
                      <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-3">
                        <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-gray-700 mb-1">{FIELD_LABELS[field]}</p>
                      <p className="text-xs text-gray-400">Klik atau drag file</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Submit Button */}
            <div className="text-center">
              <button
                type="submit"
                disabled={!allFilesSelected || isProcessing}
                className="btn-primary inline-flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>

                    <span>Proses NDRE dan Klasifikasi</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-green-600/70 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <p>© 2026 Sistem Klasifikasi Kesehatan Tanaman • Dibuat oleh TSTH2</p>
        </footer>
      </div>
    </main>
  );
}
