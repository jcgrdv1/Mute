import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Success from './pages/Success';
import Admin from './pages/Admin';
import Kiosk from './pages/Kiosk';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Monitor from './pages/Monitor';
import PR from './pages/PR';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/success" element={<Success />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/pr" element={<PR />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
