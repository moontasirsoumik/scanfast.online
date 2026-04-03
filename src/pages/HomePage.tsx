import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Grid, Column, ClickableTile, Tag } from '@carbon/react';
import { Scan, DocumentPdf, ArrowRight } from '@carbon/icons-react';
import './HomePage.css';

/** Landing page with hero and feature cards */
export default function HomePage() {
  useEffect(() => {
    document.title = 'ScanFastOnline — Free Document Scanner & PDF Manipulator';
  }, []);

  return (
    <div className="landing">
      <section className="hero">
        <h1>ScanFast<span className="brand-tld">Online</span></h1>
        <p className="hero-sub">
          Scan documents, manipulate PDFs. Free, offline, no sign-up.
        </p>
        <div className="hero-tags">
          <Tag type="blue">Offline-capable</Tag>
          <Tag type="green">No tracking</Tag>
          <Tag type="purple">Open source</Tag>
        </div>
      </section>

      <Grid>
        <Column sm={4} md={4} lg={8}>
          <Link to="/scanner" className="card-link">
            <ClickableTile>
              <div className="card">
                <div className="card-icon">
                  <Scan size={32} />
                </div>
                <h2>Scanner</h2>
                <p>
                  Scan documents with your camera or import from gallery.
                  Auto-detect edges, crop, apply filters, and save as PDF or JPEG.
                </p>
                <div className="card-action">
                  Open Scanner <ArrowRight size={16} />
                </div>
              </div>
            </ClickableTile>
          </Link>
        </Column>
        <Column sm={4} md={4} lg={8}>
          <Link to="/manipulator" className="card-link">
            <ClickableTile>
              <div className="card">
                <div className="card-icon">
                  <DocumentPdf size={32} />
                </div>
                <h2>PDF Manipulator</h2>
                <p>
                  Merge, split, rotate, reorder, delete, and compress PDF pages.
                  All in one session, fully chainable with undo/redo.
                </p>
                <div className="card-action">
                  Open Manipulator <ArrowRight size={16} />
                </div>
              </div>
            </ClickableTile>
          </Link>
        </Column>
      </Grid>

      <section className="features">
        <Grid>
          <Column sm={4} md={8} lg={16}>
            <div className="features-grid">
              <div className="feature">
                <strong>No ads. No logins.</strong>
                <span>Just open and use. Nothing gets in the way.</span>
              </div>
              <div className="feature">
                <strong>Works offline</strong>
                <span>After first load, everything runs in your browser.</span>
              </div>
              <div className="feature">
                <strong>Your data stays local</strong>
                <span>Nothing uploaded. Nothing tracked. Ever.</span>
              </div>
              <div className="feature">
                <strong>20 pages per session</strong>
                <span>Scan, merge, split — fast enough for everyday use.</span>
              </div>
            </div>
          </Column>
        </Grid>
      </section>
    </div>
  );
}
