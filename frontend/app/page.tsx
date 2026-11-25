import Link from "next/link";
import {
  ArrowRight, BarChart3, Check, CircleGauge, Layers3, Ruler, ShieldCheck,
} from "lucide-react";

const sampleRects = [
  { x: 25, y: 24, w: 164, h: 84, fill: "#dce8c5", label: "A–01" },
  { x: 195, y: 24, w: 104, h: 84, fill: "#e4e6d9", label: "B–02" },
  { x: 25, y: 116, w: 82, h: 66, fill: "#e8d9ba", label: "C–03" },
  { x: 115, y: 116, w: 82, h: 66, fill: "#d6e2df", label: "C–04" },
  { x: 205, y: 116, w: 94, h: 66, fill: "#e3d8d1", label: "D–05" },
];

export default function LandingPage() {
  return (
    <div className="marketing">
      <header className="marketing-nav">
        <Link href="/" className="brand-lockup" aria-label="ScrapLess AI home">
          <div className="brand-mark"><Layers3 size={20} /></div>
          <div><strong>scrapless<span>ai</span></strong><small>Manufacturing intelligence</small></div>
        </Link>
        <nav className="marketing-links" aria-label="Main navigation">
          <a className="optional" href="#workflow">Workflow</a>
          <a className="optional" href="#methods">Methods</a>
          <Link href="/login">Sign in</Link>
          <Link className="btn btn-primary" href="/dashboard">Explore workspace <ArrowRight size={16} /></Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">CUTTING PLANS YOU CAN INSPECT</p>
            <h1>Predict waste.<br />Optimize cutting.<br /><span>Make every sheet count.</span></h1>
            <p className="hero-copy">
              Turn a part list into a validated cutting plan. Compare real packing strategies,
              inspect every placement, and understand the material assumptions before production.
            </p>
            <div className="inline-actions">
              <Link className="btn btn-primary" href="/dashboard/optimize">Open the cutting optimizer <ArrowRight size={16} /></Link>
              <a className="btn btn-secondary" href="#workflow">See how it works</a>
            </div>
            <p className="hero-meta">Deterministic algorithms · Independent geometry checks · Transparent area metrics</p>
          </div>
          <div className="hero-visual" aria-label="Illustrative cutting plan preview">
            <div className="hero-visual-label"><strong>Rectangular stock · layout preview</strong><span>ILLUSTRATIVE</span></div>
            <svg className="hero-diagram" viewBox="0 0 324 216" role="img" aria-label="Illustrative validated arrangement of five rectangular parts within a stock sheet">
              <defs>
                <pattern id="sheet-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                  <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#e8e9df" strokeWidth="0.7" />
                </pattern>
              </defs>
              <rect x="1" y="1" width="322" height="214" fill="url(#sheet-grid)" stroke="#88917e" strokeWidth="2" />
              <path d="M10 10h10M10 10v10M314 10h-10M314 10v10M10 206h10M10 206v-10M314 206h-10M314 206v-10" fill="none" stroke="#59654e" strokeWidth="1.2" />
              {sampleRects.map((part, index) => (
                <g key={`${part.label}-${index}`}>
                  <rect x={part.x} y={part.y} width={part.w} height={part.h} fill={part.fill} stroke="#64745a" strokeWidth="1.5" />
                  <text x={part.x + part.w / 2} y={part.y + part.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="650" fill="#35402f">{part.label}</text>
                </g>
              ))}
              <text x="162" y="207" textAnchor="middle" fontSize="8" fill="#78806f">STOCK BOUNDARY · SPACING NOT TO SCALE</text>
            </svg>
            <p className="hero-caption">Illustrative geometry only. Live plans use your part dimensions and stock constraints, with placements validated before metrics are shown.</p>
          </div>
        </section>

        <section className="marketing-section marketing-band" id="workflow">
          <div className="marketing-inner">
            <p className="eyebrow">FROM PART LIST TO CUT PLAN</p>
            <h2>Production planning, made inspectable.</h2>
            <p>Bring the order, material, and stock constraints together in one repeatable workflow. Keep the assumptions visible at every step.</p>
            <div className="feature-grid">
              <article className="feature-card"><Ruler size={22} /><h3>Bring your production order</h3><p>Enter part dimensions and quantities or validate a CSV with row-level feedback before saving.</p></article>
              <article className="feature-card"><Layers3 size={22} /><h3>Compare actual strategies</h3><p>Run a deterministic FFD baseline and a MaxRects Best Short Side Fit heuristic on the same stock constraints.</p></article>
              <article className="feature-card"><ShieldCheck size={22} /><h3>Verify before you rely</h3><p>Review placements, unplaced parts, area-based utilization, and independent geometry validation.</p></article>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="material-compare">
          <div className="marketing-inner">
            <p className="eyebrow">MATERIAL UTILIZATION · MADE VISIBLE</p>
            <h2>See where the stock goes.</h2>
            <p>Compare the placement patterns produced by each strategy. The examples below are schematic; live utilization is calculated from your order and the physical stock area.</p>
            <div className="comparison-row">
              <article className="plan-snapshot">
                <div className="plan-snapshot-heading"><strong>Baseline arrangement</strong><span>ILLUSTRATIVE</span></div>
                <svg viewBox="0 0 240 150" role="img" aria-label="Illustrative baseline arrangement of rectangular parts inside stock">
                  <defs><pattern id="baseline-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#e8e9df" strokeWidth=".6" /></pattern></defs>
                  <rect x="1" y="1" width="238" height="148" fill="url(#baseline-grid)" stroke="#88917e" />
                  <rect x="12" y="12" width="126" height="53" fill="#dce8c5" stroke="#64745a" />
                  <rect x="146" y="12" width="82" height="53" fill="#e4e6d9" stroke="#64745a" />
                  <rect x="12" y="72" width="78" height="64" fill="#e8d9ba" stroke="#64745a" />
                  <rect x="98" y="72" width="130" height="64" fill="#d6e2df" stroke="#64745a" />
                </svg>
              </article>
              <div className="comparison-divider" aria-hidden="true"><ArrowRight size={19} /></div>
              <article className="plan-snapshot">
                <div className="plan-snapshot-heading"><strong>Alternative arrangement</strong><span>ILLUSTRATIVE</span></div>
                <svg viewBox="0 0 240 150" role="img" aria-label="Illustrative alternative arrangement of rectangular parts inside stock">
                  <defs><pattern id="alternative-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#e8e9df" strokeWidth=".6" /></pattern></defs>
                  <rect x="1" y="1" width="238" height="148" fill="url(#alternative-grid)" stroke="#88917e" />
                  <rect x="12" y="12" width="126" height="53" fill="#dce8c5" stroke="#64745a" />
                  <rect x="146" y="12" width="82" height="53" fill="#e4e6d9" stroke="#64745a" />
                  <rect x="146" y="72" width="78" height="64" fill="#e8d9ba" stroke="#64745a" />
                  <rect x="12" y="72" width="130" height="64" fill="#d6e2df" stroke="#64745a" />
                </svg>
              </article>
            </div>
            <p className="comparison-footnote"><strong>Utilization</strong> is physical part area divided by stock-sheet area. ScrapLess AI reports the calculated value for your actual result; spacing is reserved by the layout and is not subtracted twice.</p>
          </div>
        </section>

        <section className="marketing-section" id="methods">
          <div className="marketing-inner">
            <p className="eyebrow">TWO METHODS · THE SAME CONSTRAINTS</p>
            <h2>Compare the plan, not the promise.</h2>
            <p>Each algorithm receives the same order and sheet configuration. Neither is presented as a global optimum, and every layout is checked independently.</p>
            <div className="value-row">
              <div><strong><Layers3 size={19} /> First Fit Decreasing</strong><span>A shelf-based baseline places area-sorted parts into available rows. It gives you a deterministic point of comparison.</span></div>
              <div><strong><CircleGauge size={19} /> MaxRects BSSF</strong><span>A free-rectangle heuristic scores candidate placements by short-side fit. It can produce a different layout, not a guaranteed best one.</span></div>
              <div><strong><BarChart3 size={19} /> Material performance</strong><span>Compare sheet count, placement status, physical-area utilization, unused-area proxy, and configured sheet cost.</span></div>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-band">
          <div className="marketing-inner" style={{ textAlign: "center" }}>
            <p className="eyebrow">START WITH A WORKING DEMO</p>
            <h2>Put the next cut plan under the microscope.</h2>
            <p style={{ margin: "12px auto 22px" }}>Explore the workflow with the sample order, then bring your own production data when you are ready.</p>
            <Link className="btn btn-primary" href="/dashboard/optimize">Explore the optimizer <ArrowRight size={16} /></Link>
            <p className="hero-meta"><Check size={14} /> Demo mode is clearly labelled; demo history is not durable across service restarts.</p>
          </div>
        </section>
      </main>
      <footer className="marketing-footer"><span>© {new Date().getFullYear()} ScrapLess AI · Manufacturing intelligence</span><span>Predict waste. Optimize cutting. Make every sheet count.</span></footer>
    </div>
  );
}
