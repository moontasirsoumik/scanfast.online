import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderMenuButton,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Content,
  SkipToContent,
  Theme,
  Loading
} from '@carbon/react';
import { Scan, DocumentPdf, Information, Light, Asleep, Contrast, WifiOff } from '@carbon/icons-react';
import Toast from '@/components/shared/Toast';
import { useManipulatorStore } from '@/stores/manipulator';
import { useScannerStore } from '@/stores/scanner';
import './App.layout.css';

const HomePage = lazy(() => import('@/pages/HomePage'));
const ScannerPage = lazy(() => import('@/pages/ScannerPage'));
const ManipulatorPage = lazy(() => import('@/pages/ManipulatorPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));

/** Root application component with Carbon UIShell and routing */
export default function App() {
  const [theme, setTheme] = useState<'g100' | 'white' | 'g90'>('g100');
  const [isOnline, setIsOnline] = useState(true);

  const manipulatorPages = useManipulatorStore((s) => s.pages);
  const scannerPages = useScannerStore((s) => s.pages);
  const hasUnsavedWork = manipulatorPages.length > 0 || scannerPages.length > 0;

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'g100' ? 'white' : t === 'white' ? 'g90' : 'g100'));
  }, []);

  // Sync theme to <html> so body/scrollbar/root CSS picks up the right tokens
  useEffect(() => {
    document.documentElement.setAttribute('data-carbon-theme', theme);
  }, [theme]);

  // beforeunload warning
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (hasUnsavedWork) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork]);

  // Online/offline tracking
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
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }: { isSideNavExpanded: boolean; onClickSideNavExpand: () => void }) => (
          <>
            <Header aria-label="ScanFastOnline">
              <SkipToContent />
              <HeaderMenuButton
                aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
                onClick={onClickSideNavExpand}
                isActive={isSideNavExpanded}
              />
              <HeaderName as={Link} to="/" prefix="">
                ScanFast<span className="brand-tld">Online</span>
              </HeaderName>

              <HeaderNavigation aria-label="Main navigation">
                <HeaderMenuItem as={Link} to="/scanner">
                  Scanner
                </HeaderMenuItem>
                <HeaderMenuItem as={Link} to="/manipulator">
                  PDF Manipulator
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
                  aria-label={theme === 'g100' ? 'Switch to light mode' : theme === 'white' ? 'Switch to high contrast' : 'Switch to dark mode'}
                  onClick={toggleTheme}
                >
                  {theme === 'g100' ? <Light size={20} /> : theme === 'white' ? <Contrast size={20} /> : <Asleep size={20} />}
                </HeaderGlobalAction>
              </HeaderGlobalBar>

              <SideNav
                aria-label="Side navigation"
                expanded={isSideNavExpanded}
                isPersistent={false}
              >
                <SideNavItems>
                  <SideNavLink
                    renderIcon={Scan}
                    as={Link}
                    to="/scanner"
                  >
                    Scanner
                  </SideNavLink>
                  <SideNavLink
                    renderIcon={DocumentPdf}
                    as={Link}
                    to="/manipulator"
                  >
                    PDF Manipulator
                  </SideNavLink>
                  <SideNavLink
                    renderIcon={Information}
                    as={Link}
                    to="/about"
                  >
                    About
                  </SideNavLink>
                </SideNavItems>
              </SideNav>
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

            <Toast />
          </>
        )}
      />
    </Theme>
  );
}
