"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface ClassificationSummary {
    zona_sehat: number;
    zona_tidak_sehat: number;
    mean_confidence: number;
    num_zones: number;
    sehat_zones: number;
    sakit_zones: number;
}

interface Metadata {
    DateTime?: string;
    Latitude?: string;
    Longitude?: string;
    Altitude?: string;
}

interface AnalysisResult {
    success: boolean;
    session_id: string;
    timestamp: string;
    images: {
        original_preview: string;
        overlay_result: string;
        overlay_before_labels: string;
        final_overlay: string;
    };
    metadata: Metadata;
    classification_summary: ClassificationSummary[];
}

const API_BASE = "http://localhost:22555";

export default function ResultsPage() {
    const router = useRouter();
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [modalImage, setModalImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const storedResult = sessionStorage.getItem("analysisResult");
        if (storedResult) {
            setResult(JSON.parse(storedResult));
        }
        setLoading(false);
    }, []);

    const handleDownloadPDF = async () => {
        if (!result) return;
        setGeneratingPdf(true);

        try {
            // Create a printable version
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Pop-up blocked. Please allow pop-ups for this site.');
                setGeneratingPdf(false);
                return;
            }

            const summary = result.classification_summary[0];
            const analysisDate = new Date(result.timestamp).toLocaleString("id-ID", {
                dateStyle: "full",
                timeStyle: "medium"
            });

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Laporan Klasifikasi Kesehatan Tanaman - ${result.session_id}</title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: 'Times New Roman', Times, serif; padding: 40px; margin: 20px; color: #111; line-height: 1.5; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                        .header h1 { font-size: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
                        .header p { color: #444; font-size: 12px; }
                        .section { margin-bottom: 25px; }
                        .section-title { font-size: 14px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 15px; }
                        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                        .info-item { margin-bottom: 5px; }
                        .info-item label { font-size: 11px; color: #666; display: block; }
                        .info-item value { font-size: 13px; font-weight: 600; }
                        
                        .stats-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                        .stats-table th, .stats-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
                        .stats-table th { background-color: #f8f9fa; font-weight: 600; width: 40%; }
                        
                        .images-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
                        .image-box { text-align: center; }
                        .image-box img { max-width: 100%; height: auto; border: 1px solid #ddd; }
                        .image-box p { font-size: 11px; color: #444; margin-top: 5px; font-style: italic; }
                        
                        .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Laporan Klasifikasi Kesehatan Tanaman</h1>
                        <p>ID: ${result.session_id} • Tanggal: ${analysisDate}</p>
                    </div>

                    <div class="section">
                        <div class="section-title">Informasi & Metadata Lokasi</div>
                        <table class="stats-table">
                            <tr>
                                <th>Lintang (Latitude)</th>
                                <td>${result.metadata.Latitude || '-'}</td>
                            </tr>
                            <tr>
                                <th>Bujur (Longitude)</th>
                                <td>${result.metadata.Longitude || '-'}</td>
                            </tr>
                            <tr>
                                <th>Ketinggian (Altitude)</th>
                                <td>${result.metadata.Altitude || '-'}</td>
                            </tr>
                            <tr>
                                <th>Waktu Pengambilan</th>
                                <td>${result.metadata.DateTime || '-'}</td>
                            </tr>
                        </table>
                    </div>

                    <div class="section">
                        <div class="section-title">Hasil Analisis & Statistik</div>
                        <table class="stats-table">
                            <tr>
                                <th>Persentase Zona Sehat</th>
                                <td>${summary.zona_sehat}%</td>
                            </tr>
                            <tr>
                                <th>Persentase Zona Tidak Sehat</th>
                                <td>${summary.zona_tidak_sehat}%</td>
                            </tr>
                            <tr>
                                <th>Indeks Vegetasi Rata-rata (NDRE)</th>
                                <td>${summary.mean_confidence.toFixed(4)}</td>
                            </tr>
                            <tr>
                                <th>Jumlah Zona Sehat</th>
                                <td>${summary.sehat_zones}</td>
                            </tr>
                            <tr>
                                <th>Jumlah Zona Tidak Sehat</th>
                                <td>${summary.sakit_zones}</td>
                            </tr>
                            <tr>
                                <th>Total Zona Terdeteksi</th>
                                <td>${summary.num_zones}</td>
                            </tr>
                        </table>
                    </div>

                    <div class="section">
                        <div class="section-title">Visualisasi Hasil</div>
                        <div class="images-grid">
                            <div class="image-box">
                                <img src="${API_BASE}${result.images.original_preview}" alt="Citra Asli" />
                                <p>Citra Asli (RGB)</p>
                            </div>
                            <div class="image-box">
                                <img src="${API_BASE}${result.images.final_overlay}" alt="Hasil Klasifikasi" />
                                <p>Peta Sebaran Kesehatan (Hijau: Sehat, Merah: Tidak Sehat)</p>
                            </div>
                        </div>
                    </div>

                    <div class="footer">
                    </div>
                </body>
                </html>
            `);

            printWindow.document.close();

            setTimeout(() => {
                printWindow.print();
                setGeneratingPdf(false);
            }, 1000);

        } catch (error) {
            console.error('Error generating PDF:', error);
            setGeneratingPdf(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center">
                    <div className="animate-spin w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full mb-4" />
                    <p className="text-gray-600 font-medium">Memuat Hasil Analisis...</p>
                </div>
            </main>
        );
    }

    if (!result) {
        return (
            <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
                <div className="bg-white shadow-lg rounded-xl p-8 text-center max-w-md border border-gray-100">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800 mb-2">Tidak Ada Data</h2>
                    <p className="text-gray-500 mb-6 font-medium">Data analisis tidak ditemukan. Silakan mulai analisis baru.</p>
                    <button onClick={() => router.push("/")} className="btn-primary w-full justify-center">
                        Kembali ke Halaman Utama
                    </button>
                </div>
            </main>
        );
    }

    const summary = result.classification_summary[0];
    // Removed healthStatus logic

    return (
        <main className="min-h-screen p-4 md:p-8 bg-gray-50/50" ref={printRef}>
            <div className="max-w-[1400px] mx-auto">
                {/* Header Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 mb-1">
                                Hasil Analisis Kesehatan Tanaman
                            </h1>
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">ID: {result.session_id}</span>
                                <span>•</span>
                                <span>{new Date(result.timestamp).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleDownloadPDF}
                                disabled={generatingPdf}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors flex items-center gap-2 shadow-sm text-sm"
                            >
                                {generatingPdf ? (
                                    <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></span>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                )}
                                Unduh Laporan PDF
                            </button>
                            <button
                                onClick={() => router.push("/")}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2 shadow-sm text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Analisis Baru
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    {/* Left Panel: Visuals & Stats */}
                    <div className="xl:col-span-3 space-y-6">

                        {/* Images Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Original Image Card */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Citra Asli (RGB)
                                    </h3>
                                </div>
                                <div
                                    className="relative aspect-video bg-gray-100 cursor-zoom-in group"
                                    onClick={() => setModalImage(`${API_BASE}${result.images.original_preview}`)}
                                >
                                    <img
                                        src={`${API_BASE}${result.images.original_preview}`}
                                        alt="Original"
                                        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <span className="bg-white/90 text-gray-800 text-xs px-3 py-1.5 rounded-full font-medium shadow-sm">
                                            Perbesar Gambar
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Result Image Card */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                        </svg>
                                        Peta Klasifikasi Kesehatan
                                    </h3>
                                </div>
                                <div
                                    className="relative aspect-video bg-gray-100 cursor-zoom-in group"
                                    onClick={() => setModalImage(`${API_BASE}${result.images.final_overlay}`)}
                                >
                                    <img
                                        src={`${API_BASE}${result.images.final_overlay}`}
                                        alt="Result"
                                        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-300"
                                    />
                                    <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-3">
                                        <div className="flex items-center gap-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-sm backdrop-blur-sm">
                                            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                                            <span className="text-xs font-semibold text-gray-700">Sehat</span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-sm backdrop-blur-sm">
                                            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                                            <span className="text-xs font-semibold text-gray-700">Tidak Sehat</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Ringkasan Statistik
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                                <div>
                                    <p className="text-sm font-medium text-gray-500 mb-1">Total Luas Area</p>
                                    <p className="text-2xl font-bold text-gray-800">{summary.num_zones} <span className="text-sm font-normal text-gray-400">Cluster</span></p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-500 mb-1">Rata-rata NDRE</p>
                                    <p className="text-2xl font-bold text-blue-600">{summary.mean_confidence.toFixed(3)}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-500 mb-1">Area Sehat</p>
                                    <p className="text-2xl font-bold text-green-600">{summary.zona_sehat}%</p>
                                    <p className="text-xs text-gray-400">{summary.sehat_zones} zona terdeteksi</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-500 mb-1">Area Tidak Sehat</p>
                                    <p className="text-2xl font-bold text-red-600">{summary.zona_tidak_sehat}%</p>
                                    <p className="text-xs text-gray-400">{summary.sakit_zones} zona terdeteksi</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Metadata */}
                    <div className="xl:col-span-1 space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="font-bold text-gray-800 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Data Lokasi
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Latitude</p>
                                    <p className="font-mono text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 block">
                                        {result.metadata.Latitude || "N/A"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Longitude</p>
                                    <p className="font-mono text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 block">
                                        {result.metadata.Longitude || "N/A"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Ketinggian</p>
                                    <p className="font-mono text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 block">
                                        {result.metadata.Altitude || "N/A"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="font-bold text-gray-800 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Informasi Teknis
                            </h3>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b border-gray-50">
                                        <td className="py-2 text-gray-500">Kamera</td>
                                        <td className="py-2 text-right font-medium text-gray-800">Multispektral</td>
                                    </tr>
                                    <tr className="border-b border-gray-50">
                                        <td className="py-2 text-gray-500">Band</td>
                                        <td className="py-2 text-right font-medium text-gray-800">NIR, RedEdge</td>
                                    </tr>
                                    <tr className="border-b border-gray-50">
                                        <td className="py-2 text-gray-500">Format</td>
                                        <td className="py-2 text-right font-medium text-gray-800">TIF (16-bit)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 text-gray-500">Threshold</td>
                                        <td className="py-2 text-right font-medium text-gray-800">0.20</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-400">
                    <p>&copy; 2026 Sistem Klasifikasi Kesehatan Tanaman Kentang. TSTH2.</p>
                </div>
            </div>

            {/* Image Modal */}
            <div
                className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 transition-opacity duration-300 ${modalImage ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                onClick={() => setModalImage(null)}
            >
                {modalImage && (
                    <div className="relative max-w-7xl max-h-screen">
                        <img
                            src={modalImage}
                            alt="Full Preview"
                            className="max-h-[90vh] w-auto rounded-lg shadow-2xl"
                        />
                        <button
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
                            onClick={() => setModalImage(null)}
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
