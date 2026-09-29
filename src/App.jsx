import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Footer from './components/Footer.jsx';
import Landing from './pages/Landing.jsx';
import Method from './pages/Method.jsx';
import Detections from './pages/Detections.jsx';
import DetectionDetail from './pages/DetectionDetail.jsx';
import Upload from './pages/Upload.jsx';
import MapPage from './pages/MapPage.jsx';
import Team from './pages/Team.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <main className="mx-auto max-w-7xl px-6 pb-12 pt-24 md:px-10">
      <h1 className="h-page">Nothing here</h1>
      <p className="lede measure mt-6">This part of the seabed has not been surveyed.</p>
    </main>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const fullscreen = pathname.startsWith('/map');
  return (
    <div className="flex min-h-screen flex-col">
      {!fullscreen && <Nav />}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/method" element={<Method />} />
          <Route path="/detections" element={<Detections />} />
          <Route path="/detections/:id" element={<DetectionDetail />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/team" element={<Team />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      {!fullscreen && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Shell />
    </BrowserRouter>
  );
}
