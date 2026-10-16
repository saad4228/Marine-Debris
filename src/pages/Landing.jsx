import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../site/data.js';
import { useRecords } from '../lib/useRecords.js';
import { setProgress, snapProgress, resetProgress, MAX_DEPTH } from '../lib/scrollStore.js';
import { lerp } from '../lib/utils.js';
import DescentCanvas from '../components/DescentCanvas.jsx';
import CursorTracker from '../components/CursorTracker.jsx';
import DepthRail from '../components/DepthRail.jsx';
import DepthSection from '../components/DepthSection.jsx';
import SonarTile from '../components/SonarTile.jsx';
import SurveyDiagram from '../components/SurveyDiagram.jsx';

const LEGEND_TARGET = [{ x: 0.7, y: 0.5, size: 0.075, shadow: 3 }];

export default function Landing() {
  const { records } = useRecords(48);

  const metrics = useMemo(() => {
    if (records && records.length > 0) {
      const avgConf = (records.reduce((acc, r) => acc + (r.conf || 0), 0) / records.length).toFixed(2);
      const uniqueClasses = new Set(records.map((r) => r.cls)).size;
      return [
        { value: String(records.length), label: 'Live targets indexed', unit: 'in database' },
        { value: `${avgConf}`, label: 'Mean YOLO confidence', unit: 'score' },
        { value: '48 h', label: 'Drift forecast horizon', unit: '6 h steps' },
        { value: `${uniqueClasses}`, label: 'Debris classes detected', unit: 'categories' },
      ];
    }
    return SITE.metrics;
  }, [records]);

  useEffect(() => {
    let anchors = [];
    const computeAnchors = () => {
      const vh = window.innerHeight;
      const max = Math.max(1, document.documentElement.scrollHeight - vh);
      const els = Array.from(document.querySelectorAll('[data-depth]'));
      anchors = els.map((el) => ({
        y: Math.max(0, el.getBoundingClientRect().top + window.scrollY - vh * 0.3),
        d: Number(el.dataset.depth),
      }));
      anchors.sort((a, b) => a.y - b.y);
      anchors.push({ y: max, d: MAX_DEPTH });
    };
    const depthAt = (y) => {
      if (!anchors.length) return 0;
      if (y <= anchors[0].y) return anchors[0].d;
      for (let i = 1; i < anchors.length; i++) {
        const a = anchors[i - 1];
        const b = anchors[i];
        if (y <= b.y) return lerp(a.d, b.d, b.y === a.y ? 1 : (y - a.y) / (b.y - a.y));
      }
      return MAX_DEPTH;
    };
    const onScroll = () => setProgress(depthAt(window.scrollY) / MAX_DEPTH);
    const onResize = () => {
      computeAnchors();
      onScroll();
    };
    computeAnchors();
    snapProgress(depthAt(window.scrollY) / MAX_DEPTH);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      resetProgress();
    };
  }, []);

  return (
    <div className="relative">
      <CursorTracker />
      <DescentCanvas />
      <DepthRail />
      <div className="relative z-10">
        <DepthSection depth={0} id="surface" className="pt-24 md:pt-28" veil={false}>
          <h1 className="display-xl rise-in text-foam text-shadow-deep">{SITE.name}</h1>
          <p className="rise-in rise-in-2 mt-6 max-w-[28ch] font-body text-2xl italic text-sun text-shadow-deep md:text-3xl">{SITE.tagline}</p>
          <dl className="readout rise-in rise-in-3 mt-10 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-foamdim text-shadow-deep">
            <dt>sensor</dt><dd className="text-foam">side-scan sonar · XTF</dd>
            <dt>coverage</dt><dd className="text-foam">dual-channel swath · georeferenced</dd>
            <dt>outputs</dt><dd className="text-foam">position · drift · risk · route</dd>
          </dl>
          <div className="rise-in rise-in-4 mt-10 flex flex-wrap gap-3">
            <Link to="/upload" className="btn btn-solid">Open the workbench</Link>
            <Link to="/map" className="btn btn-ghost">Open the map</Link>
          </div>
          <p className="readout mt-20 flex items-center gap-4 text-foam text-shadow-deep" aria-hidden="true">
            <span className="scroll-cue inline-block h-8 w-px bg-ping" />
            SCROLL TO DESCEND
          </p>
        </DepthSection>

        <DepthSection depth={14} id="problem">
          <h2 className="h-section measure text-shadow-deep">What sinks stops being anyone&rsquo;s problem.</h2>
          <div className="measure mt-8 space-y-5 text-foam text-shadow-deep">
            <p>A net slips off a trawler and keeps fishing for twenty years. A container goes over the side and leaks in the dark. Tyres, drums and cable snag anchors, gear and reef, and nobody sees any of it because it is under forty metres of silty water.</p>
            <p>Nobody can clean what nobody has mapped. And nobody can plan a clean-up for something that has moved since it was mapped.</p>
          </div>
          <ul className="measure mt-10 grid gap-3 sm:grid-cols-3">
            {[['Ghost nets', 'keep catching for decades'], ['Drums and containers', 'leak slowly, out of sight'], ['Tyres, chain, cable', 'snag gear and reef']].map(([k, v]) => (
              <li key={k} className="border-l-2 border-flag pl-3 text-shadow-deep">
                <span className="block font-display font-bold">{k}</span>
                <span className="text-foamdim">{v}</span>
              </li>
            ))}
          </ul>
        </DepthSection>

        <DepthSection depth={46} id="sound">
          <h2 className="h-section measure text-shadow-deep">Light gives out. Sound doesn&rsquo;t.</h2>
          <div className="measure mt-8 space-y-5 text-foam text-shadow-deep">
            <p>A camera in coastal water dies within metres. Side-scan sonar images tens of metres to either side of the towfish regardless of visibility, at survey speed, all day.</p>
            <p>But sonar imagery is strange to read. An object shows up as a bright acoustic echo, and behind it, away from the sonar, a black shadow where the sound never reached. The shadow is not noise. Its length is the object&rsquo;s height, projected by the geometry of the ping. Its shape is the object&rsquo;s profile.</p>
          </div>
          <figure className="mt-10 max-w-xl">
            <SonarTile seed="legend-echo-shadow" targets={LEGEND_TARGET} aspect={0.5} nadirWidth={0.08} />
            <figcaption className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-foamdim text-shadow-deep">
              <span><span className="mr-2 inline-block h-2.5 w-2.5 bg-[#ffd68c] align-middle" aria-hidden="true" />bright echo, facing the nadir</span>
              <span><span className="mr-2 inline-block h-2.5 w-2.5 border border-foamdim bg-abyss align-middle" aria-hidden="true" />acoustic shadow, falling outward</span>
            </figcaption>
          </figure>
        </DepthSection>

        <DepthSection depth={88} id="survey">
          <h2 className="h-section measure text-shadow-deep">One boat, two fans of sound.</h2>
          <div className="measure mt-8 space-y-5 text-foam text-shadow-deep">
            <p>The towfish is pulled behind the vessel and pings sideways, sweeping a swath of seabed to port and to starboard. Directly beneath it is the nadir: a strip the beams cannot see. So survey lines are run overlapping, and every patch of seabed is imaged at least twice, from opposite sides.</p>
            <p>That overlap is what lets us see a target&rsquo;s shadow fall both ways, and what lets the system tell one object from two.</p>
          </div>
          <div className="mt-10 max-w-4xl p-1 md:p-3">
            <SurveyDiagram className="h-auto w-full" />
          </div>
        </DepthSection>

        <DepthSection depth={132} id="pipeline">
          <h2 className="h-section measure text-shadow-deep">The part a person shouldn&rsquo;t have to do.</h2>
          <p className="measure mt-8 text-foam text-shadow-deep">A survey day produces kilometres of waterfall. NADIR does the scrolling, then does what the scrolling was for: it tells the boat where to go.</p>
          <ol className="mt-10 max-w-3xl border-t hairline">
            {SITE.pipeline.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[3rem_1fr] gap-4 border-b hairline py-6 md:grid-cols-[4rem_1fr] text-shadow-deep">
                <span className="font-display text-3xl font-black leading-none text-ping md:text-4xl" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="text-xl md:text-2xl">{step.title}</h3>
                  <p className="mt-2 max-w-[60ch] text-foamdim">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </DepthSection>

        <DepthSection depth={180} id="seabed" veil={false}>
          <h2 className="h-section measure text-shadow-deep">Seabed.</h2>
          <p className="measure mt-6 text-foam text-shadow-deep">Behind this text is the system&rsquo;s view of the world: a live side-scan waterfall, drawn ping by ping. What follows is what it found.</p>
          <dl className="mt-10 grid max-w-5xl grid-cols-2 border hairline md:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="border hairline p-5 md:p-6 text-shadow-deep">
                <dd className="font-display text-4xl font-black leading-none tracking-tight md:text-5xl">{m.value}</dd>
                <dt className="mt-3 text-sm text-foamdim">{m.label}{m.unit ? <span className="readout ml-2 text-ping">{m.unit}</span> : null}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-14 grid max-w-5xl gap-10 md:grid-cols-3">
            {SITE.findings.map((f) => (
              <article key={f.title} className="rule-top pt-5 text-shadow-deep">
                <h3 className="text-xl">{f.title}</h3>
                <p className="mt-3 text-foamdim">{f.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-14 flex flex-wrap gap-3">
            <Link to="/detections" className="btn btn-solid">View all {records.length || 0} detections</Link>
            <Link to="/upload" className="btn btn-ghost">Open the workbench</Link>
          </div>
        </DepthSection>
      </div>
    </div>
  );
}
