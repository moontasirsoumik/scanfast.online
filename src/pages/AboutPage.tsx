import { useEffect } from 'react';
import { Grid, Column } from '@carbon/react';
import { LogoGithub, License, Security } from '@carbon/icons-react';
import './AboutPage.css';

/** About page with privacy, license, tech stack, and usage info */
export default function AboutPage() {
  useEffect(() => {
    document.title = 'About — ScanFastOnline';
  }, []);

  return (
    <div className="about-page">
      <Grid>
        <Column sm={4} md={8} lg={10}>
          <section className="page-header">
            <h1>About ScanFast<span className="brand-tld">Online</span></h1>
            <p className="lead">
              A free, open-source document scanner and PDF manipulator.
              No ads, no logins, no tracking. Everything runs in your browser.
            </p>
          </section>

          <section className="info-section">
            <div className="info-card">
              <div className="info-icon"><Security size={20} /></div>
              <div>
                <strong>Privacy</strong>
                <p>
                  All processing happens locally on your device. No data is ever uploaded
                  to any server. No analytics. No cookies for tracking. Your documents
                  never leave your browser.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon"><License size={20} /></div>
              <div>
                <strong>License</strong>
                <p>
                  ScanFastOnline is released under the MIT License. You are free to use, modify,
                  and distribute this software.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon"><LogoGithub size={20} /></div>
              <div>
                <strong>Open Source</strong>
                <p>
                  Source code is available on GitHub. Contributions welcome.
                </p>
                <a
                  href="https://github.com/moontasirsoumik/scanfast.online"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="github-link"
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </section>

          <section className="how-section">
            <h2>How it Works</h2>
            <ol className="how-list">
              <li>
                <strong>Scan or Import</strong>
                <span>Use your camera to scan documents, or import images and PDFs from your device.</span>
              </li>
              <li>
                <strong>Edit &amp; Enhance</strong>
                <span>Crop, rotate, apply filters, and rearrange pages. All processing happens instantly in your browser.</span>
              </li>
              <li>
                <strong>Export</strong>
                <span>Download as PDF or images. Share directly from your device. No account needed.</span>
              </li>
            </ol>
          </section>

          <section className="shortcuts-section">
            <h2>Keyboard Shortcuts</h2>
            <div className="shortcuts-grid">
              <div className="shortcut"><kbd>Ctrl</kbd> + <kbd>Z</kbd> <span>Undo</span></div>
              <div className="shortcut"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> <span>Redo</span></div>
              <div className="shortcut"><kbd>Ctrl</kbd> + <kbd>A</kbd> <span>Select all</span></div>
              <div className="shortcut"><kbd>Delete</kbd> <span>Delete selected</span></div>
              <div className="shortcut"><kbd>←</kbd> <kbd>→</kbd> <span>Navigate pages</span></div>
            </div>
          </section>

          <section className="tech-section">
            <h2>Built with</h2>
            <div className="tech-grid">
              <div className="tech-item">
                <strong>React</strong>
                <span>Framework</span>
              </div>
              <div className="tech-item">
                <strong>IBM Carbon</strong>
                <span>Design system</span>
              </div>
              <div className="tech-item">
                <strong>pdf-lib</strong>
                <span>PDF manipulation</span>
              </div>
              <div className="tech-item">
                <strong>pdf.js</strong>
                <span>PDF rendering</span>
              </div>
              <div className="tech-item">
                <strong>OpenCV.js</strong>
                <span>Document scanning</span>
              </div>
              <div className="tech-item">
                <strong>Cloudflare Pages</strong>
                <span>Hosting</span>
              </div>
            </div>
          </section>

          <section className="limits-section">
            <h2>Limitations</h2>
            <ul>
              <li>Maximum 20 pages per session</li>
              <li>Session data is lost on page refresh (no database)</li>
              <li>PDF compression works best on image-heavy PDFs</li>
              <li>Camera scanning requires HTTPS and browser permissions</li>
            </ul>
          </section>

          <footer className="page-footer">
            <p>Version 0.0.1 · MIT License · Made for everyday users</p>
          </footer>
        </Column>
      </Grid>
    </div>
  );
}
