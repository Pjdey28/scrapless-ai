"use client";

import { FileImage, ImagePlus, LoaderCircle, ScanSearch } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { VisionResponse } from "@/types/api";

export default function VisionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<VisionResponse | null>(null);
  const [threshold, setThreshold] = useState(180);
  const [minimumArea, setMinimumArea] = useState(400);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function chooseFile(selected: File | undefined, input: HTMLInputElement) {
    setResult(null);
    setError("");
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setFile(null);
      setPreview("");
      setError("Choose an image file.");
      input.value = "";
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFile(null);
      setPreview("");
      setError("Image exceeds the 5 MB upload limit.");
      input.value = "";
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function chooseSampleImage() {
    setError("");
    setResult(null);
    try {
      const sample = await api.sampleLayout();
      setFile(sample);
      setPreview(URL.createObjectURL(sample));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sample image could not be loaded.");
    }
  }

  async function detect() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api.vision(file, threshold, minimumArea));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image processing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">EXPERIMENTAL COMPUTER VISION</p><h1>Inspect separated material pieces.</h1><p className="page-description">OpenCV contour detection returns candidate bounding boxes in image pixels for human review.</p></div>
        <span className="mode-badge"><span /> PIXEL SPACE ONLY</span>
      </div>
      <div className="notice"><FileImage size={15} /> Detection can be affected by lighting, reflections, touching pieces, shadows, and perspective. Physical millimetre dimensions require image calibration.</div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-heading"><div><h2>Upload and tune detection</h2><p>PNG, JPEG, WEBP, BMP · maximum 5 MB / 4 megapixels</p></div><ScanSearch size={17} color="#28714e" /></div>
          <div style={{ padding: "0 16px 16px" }}>
            <div className="inline-actions" style={{ marginBottom: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => void chooseSampleImage()}>Use included sample image</button>
              <a className="btn btn-quiet" href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/demo/sample-layout.png`} download="scrapless-cutting-layout-sample.png">Download sample image</a>
            </div>
            <p className="hero-meta">The included fictional sheet image contains separated rectangles for detector testing; OpenCV processes it like any other uploaded image.</p>
            <div className="field"><label htmlFor="vision-file">Material image</label><input id="vision-file" className="input" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => chooseFile(event.currentTarget.files?.[0], event.currentTarget)} /></div>
            <div className="field-grid" style={{ marginTop: 14 }}>
              <div className="field"><label htmlFor="threshold">Threshold: {threshold}</label><input id="threshold" type="range" min="0" max="255" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><small>Grayscale binary threshold.</small></div>
              <div className="field"><label htmlFor="minimum-area">Minimum contour area: {minimumArea} px²</label><input id="minimum-area" className="input" type="number" min="1" value={minimumArea} onChange={(event) => setMinimumArea(Math.max(1, Number(event.target.value)))} /></div>
            </div>
            <button type="button" className="btn btn-primary full-width" style={{ marginTop: 15 }} onClick={() => void detect()} disabled={!file || busy}>
              {busy ? <><LoaderCircle size={14} /> Processing image…</> : <><ImagePlus size={14} /> Detect rectangular regions</>}
            </button>
            {preview && <div style={{ marginTop: 14 }}><p className="section-label">Selected image</p><Image src={preview} alt="Selected material pieces, before processing" width={1000} height={700} unoptimized style={{ display: "block", width: "auto", maxWidth: "100%", height: "auto", maxHeight: 300, objectFit: "contain", border: "1px solid #e1e7e9" }} /></div>}
          </div>
        </section>
        <section className="card">
          <div className="card-heading"><div><h2>Detection candidates</h2><p>{result ? `${result.candidate_count} candidate regions · coordinates in pixels` : "Annotated output will be displayed here."}</p></div></div>
          {result ? (
            <div style={{ padding: "0 16px 16px" }}>
              <Image src={`data:image/png;base64,${result.annotated_image_base64}`} alt={`Image annotated with ${result.candidate_count} detected bounding boxes`} width={1200} height={800} unoptimized style={{ display: "block", width: "auto", maxWidth: "100%", height: "auto", maxHeight: 340, margin: "0 auto 13px", objectFit: "contain", border: "1px solid #e1e7e9" }} />
              {result.regions.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Candidate</th><th>X, Y</th><th>Width × height</th><th>Contour area</th></tr></thead><tbody>{result.regions.map((region, index) => <tr key={`${region.x}-${region.y}-${index}`}><td>#{index + 1}</td><td>{region.x}, {region.y}</td><td>{region.width} × {region.height} px</td><td>{region.contour_area_pixels.toFixed(0)} px²</td></tr>)}</tbody></table></div> : <div className="empty compact"><h3>No candidates detected</h3><p>Adjust threshold or minimum area, then run detection again.</p></div>}
            </div>
          ) : <div className="empty"><div className="empty-icon"><ScanSearch size={20} /></div><h3>No image processed</h3><p>Upload an image of separated pieces and adjust the detector parameters.</p></div>}
        </section>
      </div>
      {result && <div className="notice notice-info" style={{ marginTop: 14 }}>{result.limitation}</div>}
    </>
  );
}
