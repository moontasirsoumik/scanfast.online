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
];

/** Root application component with desktop header navigation and a compact mobile dock. */
export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<'g100' | 'white'>('g100');
  const [isOnline, setIsOnline] = useState(true);
  const isWorkPage = location.pathname === '/scanner' || location.pathname === '/manipulator';
  const showPersistentMobileTabbar = !isWorkPage;
  const isAboutPage = location.pathname === '/about';
  const crossNavTo = location.pathname === '/scanner' ? '/manipulator' : '/scanner';
  const crossNavLabel = location.pathname === '/scanner' ? 'PDF Tools' : 'Scanner';

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
          <HeaderMenuItem
            as={Link}
            to="/scanner"
            aria-current={location.pathname === '/scanner' ? 'page' : undefined}
            className={`desktop-nav-link${location.pathname === '/scanner' ? ' is-active' : ''}`}
          >
            Scanner
          </HeaderMenuItem>
          <HeaderMenuItem
            as={Link}
            to="/manipulator"
            aria-current={location.pathname === '/manipulator' ? 'page' : undefined}
            className={`desktop-nav-link${location.pathname === '/manipulator' ? ' is-active' : ''}`}
          >
            PDF Tools
          </HeaderMenuItem>
        </HeaderNavigation>

        <HeaderGlobalBar>
          {!isOnline && (
            <div className="offline-badge">
              <WifiOff size={16} />
              <span>Offline</span>
            </div>
          )}
          {isWorkPage ? (
            <Link to={crossNavTo} className="header-cross-nav">
              {crossNavLabel}
            </Link>
          ) : null}
          <Link
            to="/about"
            aria-label="About"
            className={`cds--header__action header-global-link${isAboutPage ? ' is-active' : ''}`}
          >
            <Information size={18} />
          </Link>
          <HeaderGlobalAction
            aria-label={theme === 'g100' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'g100' ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <Content id="main-content" className={`app-content${showPersistentMobileTabbar ? ' has-mobile-tabbar' : ''}`}>
        <Suspense fallback={<Loading withOverlay={false} />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/manipulator" element={<ManipulatorPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </Suspense>
      </Content>

      {showPersistentMobileTabbar ? (
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
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <Toast />
    </Theme>
  );
}
