import { Link } from 'react-router-dom';
import SurfaceBand from '../components/SurfaceBand.jsx';
import SonarTile from '../components/SonarTile.jsx';

const SECTIONS = [
  { id: 'geometry', title: 'A sonar record is not a picture' },
  { id: 'clean', title: 'Cleaning the record' },
  { id: 'tiling', title: 'Tiling the waterfall' },
  { id: 'detect', title: 'What the detector returns' },
  { id: 'shadow', title: 'Shadow as a measurement' },
  { id: 'measure', title: 'Geotag, size, reconcile' },
  { id: 'review', title: 'Review and export' },
  { id: 'limits', title: 'What it does not do' },
];

export default function Method() {
  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="max-w-4xl">
          <h1 className="h-page text-shadow-deep">Method</h1>
          <p className="lede measure mt-6 text-foam">NADIR treats side-scan sonar as what it is: acoustic travel times, not pixels. A detector sits in the middle of a pipeline that knows about slant range, towfish altitude and shadow geometry. This page describes what the system actually does today, including the parts that are still approximations.</p>
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
              <p className="text-foamdim">Each ping is a time series of echo intensity. Time is slant range along the beam, not distance along the seabed, so a flat bottom looks compressed near the fish and stretched far from it. We parse the XTF ping headers for altitude, heading and position, detect the first bottom return, and convert every sample to ground range with <em>ground</em> = √(<em>slant</em>² − <em>altitude</em>²).</p>
              <p className="text-foamdim">Water-column samples — everything before the seabed arrives — are removed. Echo strength also falls with range and beam angle, so the across-track gain profile is measured from the survey itself (the median of each range bin across all pings, so real targets cannot bias it) and divided out. After this a rock at 80 m looks like a rock at 20 m, and the detector never has to learn that difference.</p>
              <p className="text-foamdim">XTF files vary. The primary parser is <code className="readout">pyxtf</code>; when a file defeats it, a byte-level fallback re-syncs on the packet marker and unpacks the headers directly. Files that would otherwise be unreadable still process.</p>
            </div>
            <figure className="self-start">
              <SonarTile seed="method-raw" targetCount={2} aspect={0.6} />
              <figcaption className="mt-2 text-sm text-foamdim">A corrected waterfall tile. The dark strip is the nadir; range runs outward on both sides.</figcaption>
            </figure>
          </section>

          <section id="clean" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[1].title}</h2>
            <p className="text-foamdim">Sonar returns carry multiplicative speckle, transducer beam-pattern shading, ping-to-ping gain jitter, and outright bad pings. Cleaning runs in two passes, on either side of the geometric correction.</p>
            <p className="text-foamdim"><strong className="text-foam">Before geometry.</strong> Dead and saturated pings are found with a median-absolute-deviation test and rebuilt by interpolating their neighbours — never dropped, because every waterfall row is indexed against a navigation fix and removing rows would shift every position downstream. Electrical spikes are clipped at a high percentile. This has to happen first: one saturated ping drags the first-bottom-return search off the true seabed.</p>
            <p className="text-foamdim"><strong className="text-foam">After geometry.</strong> The across-track beam pattern and along-track banding are flattened, then speckle is suppressed. Because speckle is multiplicative, filtering happens in the log domain, where it becomes additive noise that linear filters can remove cleanly.</p>
            <p className="text-foamdim">The despeckle stage is an ordered chain — currently a Lee filter followed by a bilateral filter. That order is not a preference: the deployed weights were trained on tiles filtered exactly that way, so inference has to reproduce it or the model sees different image statistics than it learned from. Filtering is applied per channel, before port and starboard are joined, so no window ever straddles the nadir seam.</p>
          </section>

          <section id="tiling" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[2].title}</h2>
            <p className="text-foamdim">Port is mirrored and joined to starboard into one continuous waterfall with the nadir at centre, then stretched to 8-bit using percentile clipping so a few bright specular returns cannot flatten everything else.</p>
            <p className="text-foamdim">That waterfall is cut into overlapping 640×640 tiles with 128 px of overlap, so a target near a seam appears whole in at least one tile. Each tile carries its ping range, its side of the nadir, and the averaged altitude, depth and swath range for that ping window — everything needed to place a box back on the survey line.</p>
          </section>

          <section id="detect" className="grid gap-8 md:grid-cols-[minmax(0,64ch)_1fr]">
            <div className="measure space-y-5">
              <h2 className="text-3xl md:text-4xl">{SECTIONS[3].title}</h2>
              <p className="text-foamdim">A single-stage YOLOv8 detector runs on every tile, concurrently. It was trained for 50 epochs on speckle-filtered sonar tiles across 14 classes: bottle, can, chain, drink carton, hook, propeller, tyre, valve, plane, ship, human, ghost net, crab pot and fishing gear.</p>
              <p className="text-foamdim">On its own validation set it reaches <strong className="text-foam">mAP@50 of 0.775</strong> and mAP@50-95 of 0.559, with precision 0.844 and recall 0.788.</p>
              <p className="text-foamdim">For each box the model returns exactly three things: a class, a confidence, and a normalised rectangle. <strong className="text-foam">That is the entire model output.</strong> Position, size, height, mass and risk are all derived afterwards from that box and the geometry around it — which is why the sections below matter, and why their assumptions are stated rather than hidden.</p>
            </div>
            <figure className="self-start">
              <SonarTile seed="method-shadow" targets={[{ x: 0.26, y: 0.5, size: 0.085, shadow: 3.2 }]} showBox label="SHIP 0.74" aspect={0.6} />
              <figcaption className="mt-2 text-sm text-foamdim">The box encloses echo and shadow together. The shadow falls away from the nadir, so its direction tells you which side the target lies on.</figcaption>
            </figure>
          </section>

          <section id="shadow" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[4].title}</h2>
            <p className="text-foamdim">Side-scan does not measure height directly, but it measures a shadow, and a shadow is a measurement of height. For a towfish at altitude <em>a</em>, an object at ground range <em>R</em> casting a shadow of length <em>L</em> has height</p>
            <p className="readout border-l-2 border-ping pl-4 text-foam">h = (L × a) / (R + L)</p>
            <p className="text-foamdim">The shadow outline is also the object&rsquo;s silhouette. A tyre lying flat casts a short, notched shadow. A standing drum casts a rectangle with a flat end. A draped net casts almost nothing, which is why nets are the hardest class.</p>
            <p className="text-foamdim">The equation is standard and the altitude comes from the ping header, so that part is real. The shadow length fed into it is not yet: it is currently scaled from the box height by a fixed factor rather than derived from the tile&rsquo;s true metres-per-pixel. Heights should therefore be read as indicative, not surveyed. See <a href="#limits" className="text-ping hover:text-foam">what it does not do</a>.</p>
          </section>

          <section id="measure" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[5].title}</h2>
            <p className="text-foamdim"><strong className="text-foam">Position.</strong> This part is genuinely measured. The box&rsquo;s row gives the ping window, and the ping headers give the vehicle&rsquo;s position and heading. The box&rsquo;s column gives ground range and which side of the nadir the target lies on. Offsetting the vehicle position perpendicular to its heading by that range yields latitude and longitude.</p>
            <p className="text-foamdim">Navigation is validated before use: missing, non-numeric, out-of-range and null-island (0, 0) fixes are all rejected. A rejected fix stays empty. A target detected without navigation is reported as <em>detected but unlocated</em> and tagged as such — it is never given a plausible-looking position to fill the gap.</p>
            <p className="text-foamdim"><strong className="text-foam">Size.</strong> Length comes from the box width scaled by the swath range; height comes from the shadow. Across-track width is not reported at all, because a single side-scan pass cannot observe it — a target has one horizontal extent along the beam and a shadow, and nothing that resolves the third axis. Where a dimension is unmeasured the interface shows a dash rather than a number.</p>
            <p className="text-foamdim"><strong className="text-foam">Reconciliation.</strong> The same object seen twice — from an adjacent line, or an overlapping tile — is matched by class within roughly 15 m, with a longitude tolerance that widens toward the poles. The higher-confidence view becomes the record. Targets with no position are always inserted, since there is nothing to compare them against.</p>
          </section>

          <section id="review" className="measure space-y-5">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[6].title}</h2>
            <p className="text-foamdim">Every target lands as a <em>Candidate</em>. An analyst confirms or rejects it from the registry, and each decision is written to an append-only review trail with the reviewer&rsquo;s name and a timestamp. The identity is stated, not authenticated — it makes the trail readable, it does not make it trusted.</p>
            <p className="text-foamdim">The catalogue exports as GeoJSON for charting and CSV for inspection, and the sonar tile behind any individual detection can be downloaded on its own. GeoJSON necessarily contains only georeferenced targets, since a feature without geometry is not a feature; the CSV carries every record, unlocated ones included, with empty coordinate columns.</p>
          </section>

          <section id="limits" className="measure space-y-5 border-l-2 border-flag pl-6">
            <h2 className="text-3xl md:text-4xl">{SECTIONS[7].title}</h2>
            <p className="text-foamdim">It reports candidates, not confirmations. Every target is a claim for a person to check, and the confidence is the model&rsquo;s, not the survey&rsquo;s.</p>
            <p className="text-foamdim"><strong className="text-foam">Dimensions are approximations.</strong> Echo length and shadow length are scaled from the detector&rsquo;s normalised box by fixed factors, not derived from the tile&rsquo;s real metres-per-pixel. The shadow-height equation is correct, but its inputs are not yet calibrated, so lengths and heights can be substantially wrong. Estimated mass compounds this further and additionally assumes a solid volume at a per-class bulk density — treat it as an order of magnitude, not a weight.</p>
            <p className="text-foamdim"><strong className="text-foam">Drift and risk are prototypes.</strong> The drift forecast and hazard exposure currently run against a synthetic current field and hand-drawn hazard polygons, not live oceanographic data. The interface is real and the scoring is transparent, but the numbers are not yet grounded in a forecast product. Do not plan an operation on them.</p>
            <p className="text-foamdim">Ghost nets are the weakest class. They drape, return weakly and cast a diffuse shadow. Route legs are straight lines and do not avoid land. Hazard zones are team-maintained files, not live feeds.</p>
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
