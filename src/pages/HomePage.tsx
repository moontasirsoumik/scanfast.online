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
          Scan documents and edit PDFs — right in your browser. Free and private.
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
                  Use your phone camera to scan documents, or pick photos from your gallery.
                  Straighten, crop, and enhance — then save as PDF.
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
                  Combine PDFs, rearrange pages, rotate, split, and compress.
                  Everything happens on your device — nothing gets uploaded.
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
                <strong>No sign-up needed</strong>
                <span>Just open the app and start using it.</span>
              </div>
              <div className="feature">
                <strong>Works without internet</strong>
                <span>Everything runs locally in your browser.</span>
              </div>
              <div className="feature">
                <strong>100% private</strong>
                <span>Your documents never leave your device.</span>
              </div>
              <div className="feature">
                <strong>Fast and lightweight</strong>
                <span>Scan up to 20 pages in a single session.</span>
              </div>
            </div>
          </Column>
        </Grid>
      </section>
    </div>
  );
}
