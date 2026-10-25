import {ExternalLink} from 'lucide-react';

export function SiteFooter() {
  return <footer className="site-footer">
    <p className="site-footer-primary">Designed &amp; developed by <strong>Subroto Kumar Barman</strong> <span aria-hidden="true">·</span> Full Stack Developer</p>
    <a className="site-footer-link" href="https://skbarman.com" target="_blank" rel="noopener noreferrer">
      skbarman.com <ExternalLink size={14} aria-hidden="true" />
    </a>
    <p className="site-footer-muted">Built with Puppeteer <span aria-hidden="true">Â·</span> Vercel Serverless <span aria-hidden="true">Â·</span> SSRF Protected</p>
  </footer>;
}
