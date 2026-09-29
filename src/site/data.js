// All editable content lives here. Every invented value is marked TODO.

export const SITE = {
  name: 'NADIR',
  tagline: 'Reading the seabed with sound.',
  event: 'Smart India Hackathon 2026',
  eventShort: 'SIH 2026',
  problemStatement: 'PS 26057',
  maxDepth: 180,

  // TODO: team name as registered on the SIH portal
  teamName: 'Team Nadir',

  contact: {
    email: 'team@nadir.example', // TODO
    repo: 'https://gitlab.com/saad-company-group/nadir', // TODO
  },

  nav: [
    { to: '/', label: 'Descent' },
    { to: '/method', label: 'Method' },
    { to: '/detections', label: 'Detections' },
    { to: '/upload', label: 'Workbench' },
    { to: '/map', label: 'Map' },
    { to: '/team', label: 'Team' },
  ],

  // Survey area and home port. TODO: replace with your real survey.
  area: {
    name: 'Survey Area',
    center: [15.42, 73.74],
    zoom: 12,
    port: { name: 'Mormugao harbour', lat: 15.411, lon: 73.803 },
  },

  vessel: {
    // TODO: real clean-up vessel figures
    name: 'Clean-up vessel',
    speedKn: 8,
    fuelLPerNm: 9.5,
    minutesPerRecovery: 35,
  },

  pipeline: [
    {
      title: 'Ingest and correct the water column',
      body:
        'Raw XTF survey lines come in ping by ping. Each ping is a time series of echo intensity, so we convert slant range to ground range using the towfish altitude, strip the water-column samples, and normalise gain across range so a rock at 80 m looks like a rock at 20 m.',
    },
    {
      title: 'Tile the waterfall',
      body:
        'The corrected waterfall is cut into overlapping tiles. The overlap is larger than the biggest target we expect, so nothing is ever split across a seam. Every tile keeps its ping range and side so results map straight back to the survey.',
    },
    {
      title: 'Detect and classify with echo and shadow',
      body:
        'A detector proposes candidates. Each is classified from two aligned crops, the echo and the shadow behind it, with the range and altitude that produced them. Shadow length and shape encode height and profile, and are often more discriminative than the echo.',
    },
    {
      title: 'Geotag, measure, reconcile',
      body:
        'Boxes become positions using the ping header and ground range. Length, width and shadow become metres; shadow becomes height; class and volume become an estimated weight. Targets seen from two lines are merged into one record.',
    },
    {
      title: 'Forecast, score, plan',
      body:
        'Currents and wind drive a drift forecast for anything that can move. Hazards at the forecast position feed a risk score and a priority tier. The urgent tier becomes an optimised route for the clean-up vessel.',
    },
  ],

  metrics: [
    // TODO: replace with numbers from your final evaluation
    { value: '0.91', label: 'recall on held-out survey lines', unit: 'IoU 0.5' },
    { value: '312', label: 'survey kilometres processed', unit: 'km' },
    { value: '48 h', label: 'drift forecast horizon', unit: '6 h steps' },
    { value: '38%', label: 'cross-line duplicates removed', unit: '' },
  ],

  findings: [
    // TODO: replace with your own findings
    {
      title: 'The shadow carries more than the echo.',
      body:
        'A classifier trained on shadow crops alone beat one trained on echo crops alone by eleven points of balanced accuracy. Together they beat both.',
    },
    {
      title: 'Where it is now is not where it will be.',
      body:
        'Nets and bags in the monsoon current moved several hundred metres a day in our forecasts. Planning a recovery from the detection position alone sends the boat to empty water.',
    },
    {
      title: 'Ghost nets are still the hard class.',
      body:
        'Nets drape. Their shadow is diffuse and their echo is weak. We say so on the review sheet rather than pretending otherwise.',
    },
  ],

  // Debris classes with the physical priors used downstream.
  //   density   bulk density kg/m³ used for the weight estimate (TODO: calibrate)
  //   mobility  0..1, how readily the object moves under current (0 = anchored)
  //   windage   0..1, fraction of wind speed transferred when at/near surface
  //   severity  0..1, harm if left in place
  classes: [
    { id: 'tyre', label: 'Tyre', density: 320, mobility: 0.25, windage: 0.0, severity: 0.45 },
    { id: 'tire', label: 'Tyre', density: 320, mobility: 0.25, windage: 0.0, severity: 0.45 },
    { id: 'drum', label: 'Drum', density: 260, mobility: 0.5, windage: 0.02, severity: 0.85 },
    { id: 'container', label: 'Container', density: 140, mobility: 0.05, windage: 0.0, severity: 0.7 },
    { id: 'ghost-net', label: 'Ghost net', density: 45, mobility: 0.9, windage: 0.03, severity: 0.9 },
    { id: 'ghost_net', label: 'Ghost net', density: 45, mobility: 0.9, windage: 0.03, severity: 0.9 },
    { id: 'chain', label: 'Chain or cable', density: 900, mobility: 0.02, windage: 0.0, severity: 0.4 },
    { id: 'bottle', label: 'Bottle', density: 400, mobility: 0.8, windage: 0.03, severity: 0.5 },
    { id: 'can', label: 'Can', density: 750, mobility: 0.65, windage: 0.02, severity: 0.5 },
    { id: 'drink_carton', label: 'Drink carton', density: 280, mobility: 0.85, windage: 0.03, severity: 0.55 },
    { id: 'hook', label: 'Hook', density: 1200, mobility: 0.03, windage: 0.0, severity: 0.45 },
    { id: 'propeller', label: 'Propeller', density: 1800, mobility: 0.01, windage: 0.0, severity: 0.6 },
    { id: 'valve', label: 'Valve', density: 1400, mobility: 0.02, windage: 0.0, severity: 0.5 },
    { id: 'plane', label: 'Plane wreck', density: 280, mobility: 0.01, windage: 0.0, severity: 0.85 },
    { id: 'ship', label: 'Shipwreck', density: 350, mobility: 0.01, windage: 0.0, severity: 0.9 },
    { id: 'human', label: 'Person / Diver', density: 980, mobility: 0.15, windage: 0.01, severity: 1.0 },
    { id: 'crab_pot', label: 'Crab pot', density: 450, mobility: 0.1, windage: 0.0, severity: 0.75 },
    { id: 'fishing_gear', label: 'Fishing gear', density: 180, mobility: 0.7, windage: 0.02, severity: 0.8 },
    { id: 'unknown', label: 'Unknown object', density: 300, mobility: 0.3, windage: 0.01, severity: 0.5 },
  ],

  // Hazard zones used by the risk score and drawn on the map.
  // TODO: every polygon below is invented. Replace with real GeoJSON.
  //   kind: current | protected | shipping | restricted | fishing | tourism | toxic | wildlife
  //   weight: 0..1 contribution to risk when a target is inside or drifts inside
  hazards: [
    {
      id: 'HZ-01', kind: 'current', name: 'Aguada channel current', weight: 0.55,
      note: 'Strong tidal stream, 0.6 to 1.1 m/s on the ebb.',
      polygon: [[15.505, 73.72], [15.51, 73.79], [15.47, 73.8], [15.455, 73.73]],
    },
    {
      id: 'HZ-02', kind: 'protected', name: 'Grande Island reef (protected)', weight: 0.9,
      note: 'Coral patch reef and dive site. Any debris here is an environmental exposure.',
      polygon: [[15.365, 73.755], [15.375, 73.79], [15.345, 73.8], [15.335, 73.76]],
    },
    {
      id: 'HZ-03', kind: 'shipping', name: 'Mormugao approach lane', weight: 0.6,
      note: 'Bulk carrier approach. Floating debris here is a navigation hazard.',
      polygon: [[15.44, 73.66], [15.45, 73.66], [15.425, 73.795], [15.415, 73.795]],
    },
    {
      id: 'HZ-04', kind: 'restricted', name: 'Naval exercise area (restricted)', weight: 0.7,
      note: 'Government property. Access requires clearance; recovery must be coordinated.',
      polygon: [[15.39, 73.66], [15.405, 73.7], [15.37, 73.72], [15.355, 73.68]],
    },
    {
      id: 'HZ-05', kind: 'fishing', name: 'Artisanal fishing ground', weight: 0.5,
      note: 'Gill-net fishery. Snag risk for gear.',
      polygon: [[15.47, 73.62], [15.49, 73.68], [15.44, 73.7], [15.43, 73.64]],
    },
    {
      id: 'HZ-06', kind: 'tourism', name: 'Colva–Benaulim beach front', weight: 0.65,
      note: 'Tourist beaches. Landfall here is a public-safety and image problem.',
      polygon: [[15.29, 73.9], [15.3, 73.915], [15.24, 73.93], [15.235, 73.915]],
    },
    {
      id: 'HZ-07', kind: 'wildlife', name: 'Jellyfish bloom (seasonal)', weight: 0.35,
      note: 'Reported bloom; diver hazard. TODO: source from a real observation feed.',
      polygon: [[15.33, 73.68], [15.35, 73.73], [15.31, 73.745], [15.3, 73.7]],
    },
    {
      id: 'HZ-08', kind: 'toxic', name: 'Outfall mixing zone', weight: 0.6,
      note: 'Treated effluent outfall. Contact hazard for divers. TODO: confirm with authority.',
      polygon: [[15.395, 73.82], [15.405, 73.84], [15.385, 73.85], [15.378, 73.83]],
    },
  ],

  // Detections. lat/lon/L/W/H/shadow come from the geotagging step of the
  // real pipeline; here they are TODO placeholders around the survey area.
  //   dims: [L, W, H] in metres. detectedAt: ISO time.
  detections: [
    {
      id: 'NDR-0417', cls: 'tyre', conf: 0.93, status: 'Confirmed by review',
      line: 'L07', ping: 18422, side: 'starboard', rangeM: 41.2, depthM: 38,
      lat: 15.4172, lon: 73.7311, dims: [1.1, 1.0, 0.3], shadowM: 3.4,
      detectedAt: '2026-01-14T06:42:00Z',
      tile: { x: 0.72, y: 0.48, size: 0.055, shadow: 2.6 },
      notes: 'Ring-shaped return with a short, blunt shadow. Consistent with a truck tyre lying flat.',
    },
    {
      id: 'NDR-0422', cls: 'drum', conf: 0.88, status: 'Confirmed by review',
      line: 'L07', ping: 19051, side: 'port', rangeM: 27.8, depthM: 39,
      lat: 15.4181, lon: 73.7298, dims: [0.9, 0.6, 0.9], shadowM: 4.1,
      detectedAt: '2026-01-14T06:47:00Z',
      tile: { x: 0.31, y: 0.55, size: 0.05, shadow: 3.2 },
      notes: 'Rectangular shadow with a flat end. Height near 0.9 m matches a standing 200 L drum.',
    },
    {
      id: 'NDR-0431', cls: 'ghost-net', conf: 0.64, status: 'Candidate',
      line: 'L08', ping: 4420, side: 'starboard', rangeM: 55.6, depthM: 44,
      lat: 15.4410, lon: 73.7440, dims: [6.2, 4.0, 0.3], shadowM: 2.0,
      detectedAt: '2026-01-14T08:10:00Z',
      tile: { x: 0.78, y: 0.36, size: 0.075, shadow: 1.2 },
      notes: 'Diffuse return over a wide area with almost no shadow. Low confidence is expected for this class.',
    },
    {
      id: 'NDR-0438', cls: 'container', conf: 0.97, status: 'Confirmed by review',
      line: 'L08', ping: 6102, side: 'port', rangeM: 33.0, depthM: 47,
      lat: 15.4228, lon: 73.7004, dims: [6.0, 2.4, 2.4], shadowM: 11.8,
      detectedAt: '2026-01-14T08:31:00Z',
      tile: { x: 0.24, y: 0.5, size: 0.11, shadow: 2.4 },
      notes: 'Hard rectangular echo with a long, straight-edged shadow. A 20 ft box on its side.',
    },
    {
      id: 'NDR-0440', cls: 'chain', conf: 0.71, status: 'Candidate',
      line: 'L08', ping: 6977, side: 'starboard', rangeM: 19.4, depthM: 46,
      lat: 15.4333, lon: 73.7622, dims: [9.5, 0.3, 0.1], shadowM: 0.4,
      detectedAt: '2026-01-14T08:40:00Z',
      tile: { x: 0.66, y: 0.62, size: 0.045, shadow: 0.5 },
      notes: 'Linear bright return with almost no shadow. Chain or cable; too flat to say more from one line.',
    },
    {
      id: 'NDR-0446', cls: 'tyre', conf: 0.86, status: 'Confirmed by review',
      line: 'L09', ping: 2210, side: 'port', rangeM: 48.9, depthM: 52,
      lat: 15.3961, lon: 73.7189, dims: [1.0, 0.9, 0.3], shadowM: 2.1,
      detectedAt: '2026-01-14T10:02:00Z',
      tile: { x: 0.28, y: 0.42, size: 0.05, shadow: 2.0 },
      notes: 'Second tyre in the dump field. Seen from the opposite side on L07 and merged.',
    },
    {
      id: 'NDR-0451', cls: 'unknown', conf: 0.58, status: 'Candidate',
      line: 'L09', ping: 3388, side: 'starboard', rangeM: 62.1, depthM: 55,
      lat: 15.3874, lon: 73.6955, dims: [2.3, 1.6, 0.9], shadowM: 5.6,
      detectedAt: '2026-01-14T10:15:00Z',
      tile: { x: 0.81, y: 0.58, size: 0.06, shadow: 3.0 },
      notes: 'Solid object with an irregular shadow. Far range and grazing angle make the profile hard to read.',
    },
    {
      id: 'NDR-0457', cls: 'drum', conf: 0.9, status: 'Confirmed by review',
      line: 'L09', ping: 4015, side: 'port', rangeM: 24.6, depthM: 54,
      lat: 15.3580, lon: 73.7720, dims: [0.9, 0.6, 0.6], shadowM: 1.6,
      detectedAt: '2026-01-14T10:24:00Z',
      tile: { x: 0.35, y: 0.47, size: 0.048, shadow: 1.8 },
      notes: 'Drum on its side inside the reef boundary. Shorter shadow than NDR-0422 despite similar echo.',
    },
    {
      id: 'NDR-0463', cls: 'ghost-net', conf: 0.69, status: 'Candidate',
      line: 'L10', ping: 1120, side: 'starboard', rangeM: 37.5, depthM: 61,
      lat: 15.4702, lon: 73.7531, dims: [8.4, 5.0, 0.5], shadowM: 3.1,
      detectedAt: '2026-01-14T12:05:00Z',
      tile: { x: 0.7, y: 0.5, size: 0.09, shadow: 1.5 },
      notes: 'Net in the channel current. The outcrop shadow helps; the net itself is barely there.',
    },
    {
      id: 'NDR-0470', cls: 'container', conf: 0.95, status: 'Confirmed by review',
      line: 'L10', ping: 2894, side: 'port', rangeM: 44.0, depthM: 63,
      lat: 15.4318, lon: 73.6790, dims: [6.1, 2.4, 2.5], shadowM: 14.2,
      detectedAt: '2026-01-14T12:22:00Z',
      tile: { x: 0.22, y: 0.55, size: 0.105, shadow: 2.8 },
      notes: 'Upright container on the edge of the approach lane. Merged with a partial view from L11.',
    },
    {
      id: 'NDR-0474', cls: 'chain', conf: 0.76, status: 'Candidate',
      line: 'L11', ping: 880, side: 'starboard', rangeM: 15.2, depthM: 66,
      lat: 15.4535, lon: 73.6519, dims: [14.0, 0.3, 0.1], shadowM: 0.3,
      detectedAt: '2026-01-14T13:40:00Z',
      tile: { x: 0.62, y: 0.4, size: 0.04, shadow: 0.4 },
      notes: 'Mooring chain in the fishing ground. Partially lost in the nadir gap and picked up again on L12.',
    },
    {
      id: 'NDR-0481', cls: 'tyre', conf: 0.82, status: 'Confirmed by review',
      line: 'L11', ping: 2461, side: 'port', rangeM: 52.3, depthM: 68,
      lat: 15.3149, lon: 73.7083, dims: [1.2, 1.1, 0.5], shadowM: 2.8,
      detectedAt: '2026-01-14T13:58:00Z',
      tile: { x: 0.27, y: 0.6, size: 0.052, shadow: 2.2 },
      notes: 'Tyre standing on edge near the reported bloom. Taller shadow than the flat ones nearby.',
    },
  ],

  team: [
    // TODO: real team
    { name: 'Saad Ahmed', role: 'Team lead, acoustics and pipeline', focus: 'XTF ingest, slant-range and gain correction, this site', link: 'https://gitlab.com/saad' },
    { name: 'Member Two', role: 'Machine learning', focus: 'YOLO detector training, echo and shadow classifier', link: null },
    { name: 'Member Three', role: 'Backend', focus: 'FastAPI service, geotagging, OpenDrift integration', link: null },
    { name: 'Member Four', role: 'Geospatial', focus: 'Hazard layers, risk model, GeoJSON export', link: null },
    { name: 'Member Five', role: 'Operations', focus: 'Mission planner, vessel model, review workflow', link: null },
    { name: 'Member Six', role: 'Systems', focus: 'Inference serving, packaging, demo hardware', link: null },
  ],

  collaborators: [
    // TODO: real mentors
    { name: 'Dr. A. Mentor', affiliation: 'Department of Ocean Engineering, TODO Institute', role: 'Faculty mentor, underwater acoustics' },
    { name: 'B. Surveyor', affiliation: 'TODO Hydrographic Survey Unit', role: 'Industry mentor, side-scan operations' },
    { name: 'C. Advisor', affiliation: 'TODO Marine Conservation Trust', role: 'Domain advisor, debris classes and clean-up priorities' },
  ],

  dataSources: [
    { name: 'Side-scan survey lines', detail: 'TODO: dataset, publisher, sensor, frequency, licence.' },
    { name: 'Ocean currents and waves', detail: 'INCOIS Indian Ocean forecasts (primary), Copernicus Marine Service (fallback), Open-Meteo Marine API (development).' },
    { name: 'Wind', detail: 'Open-Meteo weather API, 10 m wind. IMD forecasts for the operational build.' },
    { name: 'Drift model', detail: 'OpenDrift object-drift module with per-class leeway; browser demo uses a simplified advection model.' },
    { name: 'Protected areas', detail: 'Protected Planet (WDPA) API.' },
    { name: 'Ports, lanes, restricted areas', detail: 'OpenStreetMap via Overpass API; OpenSeaMap seamarks.' },
    { name: 'Bathymetry', detail: 'GEBCO 2024 grid.' },
    { name: 'Base map', detail: 'OpenStreetMap data, CARTO Dark Matter tiles.' },
  ],
};

// The classes users can filter by: canonical entries only, no spelling aliases.
export const CLASS_FILTERS = SITE.classes.filter((c) => !c.aliasOf);

// API configuration.
// mode: 'mock' runs everything in the browser from seeded random numbers.
// mode: 'live' calls baseUrl + the endpoints below.
export const API = {
  mode: 'live',
  baseUrl: '/api/v1',
  endpoints: {
    detect: '/detect',          // POST multipart "image" → { detections: [{cls, conf, x, y, w, h}] }
    xtfUpload: '/xtf/upload',   // POST multipart "file" → full XTF slicing, inference, and DB sync
    forecast: '/forecast',      // GET /forecast/:id?hours=48 → { track: [{lat, lon, hours}] }
    risk: '/risk',              // GET /risk/:id → { score, tier, factors: [{key, label, value, weight}] }
    hazards: '/hazards',        // GET /hazards → { hazards: [...] }
    mission: '/mission',        // POST { start, ids, hours } → { order, legsNm, totalNm, hours, fuelL }
  },
};
