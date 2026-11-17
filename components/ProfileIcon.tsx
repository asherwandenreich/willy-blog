// Small Notion-style line icons for the profile sidebar (app/profile/page.tsx), one per ?tab= value.
// New tab: add its drawing here (16×16, stroked). A tab without one gets the plain page icon.

const ICONS: Record<string, React.ReactNode> = {
    // Home: a house
    "": <path d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3V9.5h2V13h3V6.5" />,
    // Blog requests: an inbox tray
    requests: <><path d="M2.5 9.5 4.2 3.5h7.6l1.7 6v3h-11z" /><path d="M2.5 9.5h3l1 1.5h3l1-1.5h3" /></>,
    // College: a graduation cap
    college: <><path d="M1.5 6 8 3l6.5 3L8 9z" /><path d="M4.5 7.6v2.9c0 1 1.6 2 3.5 2s3.5-1 3.5-2V7.6M14.5 6v3.5" /></>,
    // Shopping: a cart
    shopping: <><path d="M1.5 2.5h2l1.6 7.5h7l1.4-5.5H4.3" /><circle cx="6" cy="12.8" r="0.9" /><circle cx="11.5" cy="12.8" r="0.9" /></>,
    // Backend: a server rack
    backend: <><rect x="2.5" y="2.5" width="11" height="4.5" rx="1" /><rect x="2.5" y="9" width="11" height="4.5" rx="1" /><path d="M5 4.75h.01M5 11.25h.01" /></>,
    // Contribute a blog: a pencil
    contribute: <path d="M10.5 2.5l3 3-8 8h-3v-3zM9 4l3 3" />,
    // Send a message: a speech bubble
    message: <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />,
};

// Fallback: a page with a folded corner
const PAGE = <path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" />;

export default function ProfileIcon({ tab }: { tab: string }) {
    return (
        <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            className="h-4 w-4 shrink-0 opacity-70">
            {ICONS[tab] ?? PAGE}
        </svg>
    );
}
