import Link from "next/link";
import {
  ArrowRight, BarChart3, BrainCircuit, Check, CircleGauge, Layers3, Ruler, ShieldCheck,
} from "lucide-react";

const sampleRects = [
  { x: 28, y: 25, w: 154, h: 90, fill: "#d8eee0", label: "Panel A" },
  { x: 188, y: 25, w: 108, h: 90, fill: "#e5e5f4", label: "Panel B" },
  { x: 28, y: 123, w: 88, h: 68, fill: "#fae9cf", label: "Panel C" },
  { x: 122, y: 123, w: 88, h: 68, fill: "#e0edf0", label: "Panel C" },
  { x: 216, y: 123, w: 80, h: 68, fill: "#f0dfe0", label: "Panel D" },
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
          <a className="optional" href="#how-it-works">How it works</a>
          <a className="optional" href="#platform">Platform</a>
          <Link href="/login">Sign in</Link>
          <Link className="btn btn-primary" href="/dashboard">Open demo <ArrowRight size={14} /></Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">MATERIAL PLANNING, WITH CLARITY</p>
            <h1>Make every sheet <span>count.</span></h1>
            <p className="hero-copy">
              Compare real cutting strategies before production. ScrapLess AI turns rectangular
              part orders into validated layouts, transparent material metrics, and a clearer view
              of expected waste.
            </p>
            <div className="inline-actions">
              <Link className="btn btn-primary" href="/dashboard/optimize">Start a sample analysis <ArrowRight size={14} /></Link>
              <a className="btn btn-secondary" href="#how-it-works">Explore the workflow</a>
            </div>
            <p className="hero-meta">Deterministic packing · Independent layout validation · No paid AI API required</p>
          </div>
          <div className="hero-visual">
            <div className="hero-visual-label"><strong>Sample rectangular sheet layout</strong><span>ILLUSTRATIVE</span></div>
            <svg className="hero-diagram" viewBox="0 0 324 216" role="img" aria-label="Illustrative layout of rectangular parts inside a stock sheet">
              <rect x="1" y="1" width="322" height="214" fill="#fff" stroke="#aabdb2" strokeWidth="2" />
              {sampleRects.map((part, index) => (
                <g key={`${part.label}-${index}`}>
                  <rect x={part.x} y={part.y} width={part.w} height={part.h} fill={part.fill} stroke="#668773" strokeWidth="1.5" />
                  <text x={part.x + part.w / 2} y={part.y + part.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#355044">{part.label}</text>
                </g>
              ))}
            </svg>
            <p className="hero-caption">Example geometry is illustrative. Actual layouts come from the selected packing algorithm and are validated before metrics are shown.</p>
          </div>
        </section>

        <section className="marketing-section marketing-band" id="how-it-works">
          <div className="marketing-inner">
            <p className="eyebrow">A PRACTICAL WORKFLOW</p>
            <h2>Plan before the first cut.</h2>
            <p>Bring your part list and stock constraints together in one repeatable, inspectable process.</p>
            <div className="feature-grid">
              <article className="feature-card"><Ruler size={21} /><h3>Describe the order</h3><p>Enter part dimensions and quantities, or validate a CSV and see row-specific issues before continuing.</p></article>
              <article className="feature-card"><Layers3 size={21} /><h3>Compare cutting heuristics</h3><p>Run a deterministic shelf-based baseline and a MaxRects Best Short Side Fit heuristic on identical constraints.</p></article>
              <article className="feature-card"><ShieldCheck size={21} /><h3>Inspect validated results</h3><p>Review placements, unplaced instances, area-based utilization, and clear geometry validation status.</p></article>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="platform">
          <div className="marketing-inner">
            <p className="eyebrow">BUILT FOR MANUFACTURING PLANNERS</p>
            <h2>Useful numbers. Honest assumptions.</h2>
            <div className="value-row">
              <div><strong><CircleGauge size={17} /> Material utilization</strong><span>Physical part area divided by stock area. Kerf spacing is reserved by the layout but not subtracted from the physical-area calculation.</span></div>
              <div><strong><BarChart3 size={17} /> Strategy comparison</strong><span>Compare sheet count, unplaced parts, runtime, unused-area proxy, and estimated sheet cost without implying a global optimum.</span></div>
              <div><strong><BrainCircuit size={17} /> Responsible risk signals</strong><span>Optional risk scoring is disclosed as an experimental model trained on synthetic data, never a guaranteed real-world probability.</span></div>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-band">
          <div className="marketing-inner" style={{ textAlign: "center" }}>
            <p className="eyebrow">START WITH A DEMONSTRATION</p>
            <h2>Bring your next order into focus.</h2>
            <p style={{ margin: "10px auto 18px" }}>Load a built-in sample order and run both real optimization algorithms locally.</p>
            <Link className="btn btn-primary" href="/dashboard/optimize">Open the optimizer <ArrowRight size={14} /></Link>
            <p className="hero-meta"><Check size={12} /> Demo mode is clearly labelled and does not claim to save analysis history.</p>
          </div>
        </section>
      </main>
      <footer className="marketing-footer"><span>© {new Date().getFullYear()} ScrapLess AI</span><span>Predict waste. Optimize cutting. Make every sheet count.</span></footer>
    </div>
  );
}
