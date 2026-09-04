import { SITE } from '../site/data.js';
import SurfaceBand from '../components/SurfaceBand.jsx';

export default function Team() {
  return (
    <div className="relative">
      <SurfaceBand />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-24 md:pt-28 md:px-10">
        <header className="max-w-4xl">
          <h1 className="h-page text-shadow-deep">Team</h1>
          <p className="lede measure mt-6 text-foam">{SITE.teamName}, built for {SITE.event}, problem statement {SITE.problemStatement.replace('PS ', '')}.</p>
        </header>

        <section className="mt-16">
          <h2 className="text-3xl">Members</h2>
          <ul className="mt-6 grid gap-px border hairline bg-foamdim/20 sm:grid-cols-2 lg:grid-cols-3">
            {SITE.team.map((m) => (
              <li key={m.name} className="bg-abyss p-6">
                <h3 className="text-xl">{m.name}</h3>
                <p className="mt-1 text-foamdim">{m.role}</p>
                <p className="mt-3 text-sm text-foamdim">{m.focus}</p>
                {m.link && <a href={m.link} rel="noreferrer" className="readout mt-4 inline-block text-ping hover:text-foam">{m.link.replace(/^https?:\/\//, '')}</a>}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-20">
          <h2 className="text-3xl">Mentors and collaborators</h2>
          <ul className="mt-6 grid gap-10 md:grid-cols-3">
            {SITE.collaborators.map((c) => (
              <li key={c.name} className="rule-top pt-5">
                <h3 className="text-xl">{c.name}</h3>
                <p className="mt-1 text-foamdim">{c.affiliation}</p>
                <p className="mt-3 text-sm text-foamdim">{c.role}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-20 max-w-4xl">
          <h2 className="text-3xl">Data sources</h2>
          <dl className="mt-6 border-t hairline">
            {SITE.dataSources.map((s) => (
              <div key={s.name} className="grid gap-2 border-b hairline py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <dt className="font-display font-bold">{s.name}</dt>
                <dd className="text-foamdim">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
