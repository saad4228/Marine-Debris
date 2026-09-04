import { Link } from 'react-router-dom';
import { SITE } from '../site/data.js';

export default function Footer() {
  return (
    <footer className="relative z-10 rule-top mt-24 bg-abyss">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-3 md:px-10">
        <div>
          <p className="font-display text-lg font-black">{SITE.name}</p>
          <p className="mt-1 text-foamdim">{SITE.tagline}</p>
          <p className="readout mt-4 text-foamdim">
            {SITE.event} · {SITE.problemStatement}
          </p>
        </div>
        <div>
          <p className="font-display font-bold">Pages</p>
          <ul className="mt-2 space-y-1">
            {SITE.nav.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="text-foamdim hover:text-foam">{n.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-display font-bold">Contact</p>
          <ul className="mt-2 space-y-1">
            <li><a href={`mailto:${SITE.contact.email}`} className="text-foamdim hover:text-foam">{SITE.contact.email}</a></li>
            <li><a href={SITE.contact.repo} className="text-foamdim hover:text-foam" rel="noreferrer">Source repository</a></li>
          </ul>
          <p className="mt-6 text-sm text-foamdim">
            Sonar imagery on this site is drawn procedurally in the browser. Map data © OpenStreetMap contributors, tiles by CARTO.
          </p>
        </div>
      </div>
    </footer>
  );
}
