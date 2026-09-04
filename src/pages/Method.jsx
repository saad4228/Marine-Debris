import { Link } from 'react-router-dom';
import SurfaceBand from '../components/SurfaceBand.jsx';
import SonarTile from '../components/SonarTile.jsx';

const SECTIONS = [
  { id: 'geometry', title: 'A sonar record is not a picture' },
  { id: 'tiling', title: 'Tiling the waterfall' },
  { id: 'shadow', title: 'Echo and shadow, together' },
  { id: 'measure', title: 'Geotag and measure' },
  { id: 'forecast', title: 'Forecast, score, plan' },
  { id: 'limits', title: 'What it does not do' },
];

export default function Method() {
  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="max-w-4xl">
          <h1 className="h-page text-shadow-deep">Method</h1>
          <p className="lede measure mt-6 text-foam">NADIR treats side-scan sonar as what it is: acoustic travel times, not pixels. The detector sits in the middle of a pipeline that knows about slant range, towfish altitude and shadow geometry, and everything downstream, from position to drift to risk, is derived from that geometry.</p>
        </header>

        <nav aria-label="Sections" className="mt-10 border-y hairline py-3">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {SECTIONS.map((s) => (<li key={s.id}><a href={`#${s.id}`} className="text-sm text-foamdim hover:text-foam">{s.title}</a></li>))}
          </ul>
        </nav>

        <div className="mt-16 space-y-20">
          <section id="geometry" className="grid gap-8 md:grid-cols-[minmax(0,64ch)_1fr]">
            <div className="measure space-y-5">
              <h2 className="text-3xl md:text-4xl">{SECTIONS[0].title}</h2>
              <p className="text-foamdim">Each ping is a time series of echo intensity. Time is slant range along the beam, not distance along the seabed, so a flat bottom looks compressed near the fish and stretched far from it. We read the XTF ping headers for altitude, heading, layback and position, then convert every sample to ground range using the first bottom return.</p>
              <p className="text-foamdim">Water-column samples are removed. Echo strength falls with range and beam angle, so we apply a time-varied gain and a beam-pattern correction estimated from the survey itself. After this a rock at 80 m looks like a rock at 20 m, and the detector never has to learn that difference.</p>
            </div>
            <figure className="self-start">
              <SonarTile seed="method-raw" targetCount={2} aspect={0.6} />
              <figcaption className="mt-2 text-sm text-foamdim">A corrected waterfall tile. The dark strip is the nadir; range runs outward on both sides.</figcaption>
            </figure>
          </section>

          <section id="tiling" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[1].title}</h2>
            <p className="text-foamdim">The corrected waterfall is cut into tiles with an overlap larger than the longest target we expect, including its shadow. Nothing is split across a seam. Each tile remembers its ping range, its side of the nadir and the altitude of the fish, so any box can be placed back on the survey line.</p>
            <p className="text-foamdim">The YOLO detector runs on these tiles and returns boxes in pixel space with a class and a confidence. That is all it returns. Everything else on this site is derived from those boxes and the geometry around them.</p>
          </section>

          <section id="shadow" className="grid gap-8 md:grid-cols-[minmax(0,64ch)_1fr]">
            <div className="measure space-y-5">
              <h2 className="text-3xl md:text-4xl">{SECTIONS[2].title}</h2>
              <p className="text-foamdim">For a towfish at altitude <em>a</em> and an object of height <em>h</em> at ground range <em>R</em>, the acoustic shadow has length roughly <em>R</em>·<em>h</em> / (<em>a</em> − <em>h</em>). The shadow is a measurement of height. Its outline is the object&rsquo;s silhouette. A tyre lying flat casts a short, notched shadow. A standing drum casts a rectangle with a flat end. A net casts almost nothing.</p>
              <p className="text-foamdim">So the classifier receives two aligned crops per candidate, echo and shadow, oriented so range increases the same way, plus the range and altitude that produced them. In our ablations the shadow branch alone outperformed the echo branch alone, and the fused model outperformed both.</p>
            </div>
            <figure className="self-start">
              <SonarTile seed="method-shadow" targets={[{ x: 0.26, y: 0.5, size: 0.085, shadow: 3.2 }]} showBox label="DRUM 0.90" aspect={0.6} />
              <figcaption className="mt-2 text-sm text-foamdim">The box encloses echo and shadow. The shadow falls to port because the target is on the port side.</figcaption>
            </figure>
          </section>

          <section id="measure" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[3].title}</h2>
            <p className="text-foamdim"><strong className="text-foam">Position.</strong> The box&rsquo;s row gives the ping, and the ping header gives the fish position and heading. The box&rsquo;s column gives ground range and side. Offsetting the fish position perpendicular to the track by that range gives latitude and longitude.</p>
            <p className="text-foamdim"><strong className="text-foam">Size.</strong> Along-track length is box height in pings times distance per ping. Across-track width is box width in samples times range resolution. Height comes from the shadow, as above. Weight is an estimate: L × W × H times a bulk density per class, and it is labelled as an estimate everywhere it appears.</p>
            <p className="text-foamdim"><strong className="text-foam">Reconciliation.</strong> Adjacent lines see the same object from opposite sides. Targets are clustered within the survey&rsquo;s navigation uncertainty, the higher-confidence view becomes the record, and disagreements on class are flagged rather than resolved silently.</p>
          </section>

          <section id="forecast" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[4].title}</h2>
            <p className="text-foamdim"><strong className="text-foam">Drift.</strong> Anything that can move is advected through a current and wind forecast for 6 to 48 hours. Per class we carry a mobility prior (a container does not move; a net does), a critical current speed below which the object stays put, and a windage term for anything near the surface. The production model is OpenDrift on INCOIS or Copernicus currents; the demo on this site is a simplified advection scheme with the same interface.</p>
            <p className="text-foamdim"><strong className="text-foam">Risk.</strong> The forecast track is checked against hazard zones: protected reef, shipping lanes, restricted and government areas, fishing grounds, tourist beaches, wildlife and outfall zones. Exposure, class severity, confidence, estimated mass, mobility and displacement are combined with transparent weights into a 0 to 100 score and a tier: Immediate, High, Moderate, Low. Every factor is shown on the target&rsquo;s page.</p>
            <p className="text-foamdim"><strong className="text-foam">Plan.</strong> The mission planner takes the urgent tiers, uses their forecast positions at the chosen horizon rather than where they were found, and solves the visiting order from the home port with nearest-neighbour construction and 2-opt improvement. It reports distance, time including recovery, and fuel.</p>
          </section>

          <section id="limits" className="measure space-y-5 border-l-2 border-flag pl-6">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[5].title}</h2>
            <p className="text-foamdim">It reports candidates, not confirmations. Every target is a claim for a person to check, and the confidence is the model&rsquo;s, not the survey&rsquo;s.</p>
            <p className="text-foamdim">Ghost nets are the weakest class. They drape, return weakly and cast a diffuse shadow. Recall on nets is well below the other classes and we say so wherever the number is shown.</p>
            <p className="text-foamdim">Drift forecasts are forecasts. The uncertainty fan grows with time and the planner should be re-run as new current data arrives. Weight is an estimate from a density table. Route legs are straight lines and do not yet avoid land. Hazard zones for wildlife and toxicity are team-maintained files, not live feeds.</p>
          </section>
        </div>

        <div className="mt-20 flex flex-wrap gap-3 border-t hairline pt-10">
          <Link to="/upload" className="btn btn-solid">Open the workbench</Link>
          <Link to="/map" className="btn btn-ghost">Open the map</Link>
        </div>
      </main>
    </div>
  );
}
