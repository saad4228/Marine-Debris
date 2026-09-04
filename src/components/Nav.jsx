import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { SITE } from '../site/data.js';
import { isMock } from '../site/api.js';

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location]);

  return (
    <header className={`site-nav fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'scrolled' : ''}`}>
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-8 gap-y-3 px-6 py-4 md:px-10"
      >
        <Link to="/" className="font-display text-xl font-black tracking-tight text-foam no-underline flex items-baseline">
          {SITE.name}
          <span className="readout ml-3 hidden text-foamdim sm:inline">{SITE.problemStatement}</span>
          {isMock && <span className="readout ml-3 hidden text-ping md:inline">mock data</span>}
        </Link>
        <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {SITE.nav.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className="nav-link">
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
