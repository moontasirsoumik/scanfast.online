import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Content,
  SkipToContent,
  Theme,
  Loading
} from '@carbon/react';
import { Scan, DocumentPdf, Information, Light, Asleep, WifiOff } from '@carbon/icons-react';
import Toast from '@/components/shared/Toast';
import { useManipulatorStore } from '@/stores/manipulator';
import { useScannerStore } from '@/stores/scanner';
import './App.layout.css';

const HomePage = lazy(() => import('@/pages/HomePage'));
const ScannerPage = lazy(() => import('@/pages/ScannerPage'));
const ManipulatorPage = lazy(() => import('@/pages/ManipulatorPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));

const navItems = [
  { to: '/scanner', label: 'Scanner', icon: Scan },
  { to: '/manipulator', label: 'PDF Tools', icon: DocumentPdf },
  { to: '/about', label: 'About', icon: Information },
];

/** Root application component with desktop header navigation and a compact mobile dock. */
export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<'g100' | 'white'>('g100');
  const [isOnline, setIsOnline] = useState(true);

  const manipulatorPages = useManipulatorStore((s) => s.pages);
  const scannerPages = useScannerStore((s) => s.pages);
  const hasUnsavedWork = manipulatorPages.length > 0 || scannerPages.length > 0;

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'g100' ? 'white' : 'g100'));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-carbon-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedWork) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <Theme theme={theme}>
      <Header aria-label="ScanFastOnline">
        <SkipToContent />
        <HeaderName as={Link} to="/" prefix="">
          ScanFast<span className="brand-tld">Online</span>
        </HeaderName>

        <HeaderNavigation aria-label="Main navigation" className="desktop-nav">
          <HeaderMenuItem as={Link} to="/scanner">
            Scanner
          </HeaderMenuItem>
          <HeaderMenuItem as={Link} to="/manipulator">
            PDF Tools
          </HeaderMenuItem>
          <HeaderMenuItem as={Link} to="/about">
            About
          </HeaderMenuItem>
        </HeaderNavigation>

        <HeaderGlobalBar>
          {!isOnline && (
            <div className="offline-badge">
              <WifiOff size={16} />
              <span>Offline</span>
            </div>
          )}
          <HeaderGlobalAction
            aria-label={theme === 'g100' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'g100' ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <Content id="main-content">
        <Suspense fallback={<Loading withOverlay={false} />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/manipulator" element={<ManipulatorPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </Suspense>
      </Content>

      <nav className="mobile-tabbar" aria-label="Quick navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`mobile-tabbar-link${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Toast />
    </Theme>
  );
}
