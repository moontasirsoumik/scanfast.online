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
        <Column sm={4} md={8} lg={16}>
          <section className="page-header">
            <h1>About ScanFast<span className="brand-tld">Online</span></h1>
            <p className="lead">
              A free, open-source document scanner and PDF manipulator.
              No ads, no logins, no tracking. Everything runs in your browser.
            </p>
          </section>

          <section className="info-section">
            <div className="info-card">
              <div className="info-icon"><Security size={28} /></div>
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
              <div className="info-icon"><License size={28} /></div>
              <div>
                <strong>License</strong>
                <p>
                  ScanFastOnline is released under the MIT License. You are free to use, modify,
                  and distribute this software.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon"><LogoGithub size={28} /></div>
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
            <h3 className="how-subheading">Scanner</h3>
            <ol className="how-list">
              <li>
                <div>
                  <strong>Scan or Import</strong>
                  <span>Use your camera to capture documents, or import existing images and PDFs from your device.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Crop &amp; Enhance</strong>
                  <span>Adjust the crop quad, straighten, rotate, and apply filters like grayscale or high-contrast. All processing is instant, in-browser.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Export or Send to PDF Tools</strong>
                  <span>Download as a PDF or individual images, share directly from your device, or open pages in PDF Tools for further editing.</span>
                </div>
              </li>
            </ol>
            <h3 className="how-subheading">PDF Tools</h3>
            <ol className="how-list">
              <li>
                <div>
                  <strong>Load PDFs or Images</strong>
                  <span>Drag and drop, tap to browse, or receive pages from the Scanner. Multiple files can be merged in one session.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Organise Pages</strong>
                  <span>Drag to reorder, rotate, duplicate, delete, or insert blank pages. Select multiple pages to act on a range at once.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Split or Compress</strong>
                  <span>Split pages into named groups and download each as a separate PDF. Compress image-heavy pages by reducing JPEG quality to shrink file size.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Export or Share</strong>
                  <span>Save as a single PDF, export pages as individual JPGs, print, or open your device's share sheet to send the file anywhere.</span>
                </div>
              </li>
            </ol>
          </section>

          <section className="shortcuts-section">
            <h2>Keyboard Shortcuts</h2>
            <div className="shortcuts-grid">
              <div className="shortcut"><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Z</kbd> <span>Undo</span></div>
              <div className="shortcut"><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> <span>Redo</span></div>
              <div className="shortcut"><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>A</kbd> <span>Select all</span></div>
              <div className="shortcut"><kbd>Delete</kbd> / <kbd>⌫</kbd> <span>Delete selected</span></div>
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
                <strong>Canvas API</strong>
                <span>Image processing</span>
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
              <li>Maximum 50 pages per session</li>
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
